const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// HTTP 서버 설정
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './word_chain_game.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentTypeMap = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
    };

    const contentType = contentTypeMap[extname] || 'text/plain';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// 서버 포트 설정
const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}/`);
    console.log(`Network access: http://172.30.1.42:${PORT}/`);
});

// WebSocket 서버 설정
const wss = new WebSocket.Server({ server });

// 게임 상태 관리
const rooms = {
    'main': {
        players: [],
        currentWord: '코딩',
        currentTurn: null,
        gameStarted: false
    }
};

// 클라이언트 관리
const clients = new Map();

wss.on('connection', (ws) => {
    console.log('클라이언트가 연결되었습니다.');
    
    // 클라이언트 데이터 초기화
    const clientData = {
        nickname: '',
        room: 'main'
    };

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'join':
                    handleJoin(ws, clientData, data);
                    break;
                case 'submit_word':
                    handleWordSubmission(ws, clientData, data);
                    break;
                case 'chat':
                    handleChat(ws, clientData, data);
                    break;
            }
        } catch (e) {
            console.error('메시지 처리 오류:', e);
        }
    });

    ws.on('close', () => {
        // 연결이 종료되면 해당 클라이언트 제거
        if (clientData.nickname) {
            const room = rooms[clientData.room];
            
            if (room) {
                // 플레이어 목록에서 제거
                const playerIndex = room.players.findIndex(player => player.nickname === clientData.nickname);
                if (playerIndex !== -1) {
                    room.players.splice(playerIndex, 1);
                
                    // 플레이어가 나갔음을 다른 사람들에게 알림
                    broadcastToRoom(clientData.room, {
                        type: 'player_left',
                        nickname: clientData.nickname
                    }, ws);
                }
                
                // 게임 상태 재설정 (플레이어가 없는 경우)
                if (room.players.length === 0) {
                    room.gameStarted = false;
                    room.currentWord = '코딩';
                    room.currentTurn = null;
                }
            }
            
            clients.delete(ws);
        }
        
        console.log('클라이언트 연결이 종료되었습니다.');
    });
    
    // 클라이언트 객체 저장
    clients.set(ws, clientData);
});

// 메시지 핸들러 함수
function handleJoin(ws, clientData, data) {
    const nickname = data.nickname.trim();
    
    if (!nickname) {
        sendToClient(ws, {
            type: 'join_result',
            success: false,
            message: '닉네임이 비어있습니다.'
        });
        return;
    }
    
    // 이미 동일 닉네임이 있는지 확인
    const room = rooms['main'];
    const existingPlayer = room.players.find(player => player.nickname === nickname);
    
    if (existingPlayer) {
        sendToClient(ws, {
            type: 'join_result',
            success: false,
            message: '이미 사용 중인 닉네임입니다.'
        });
        return;
    }

    // 닉네임 설정
    clientData.nickname = nickname;
    
    // 플레이어 추가
    room.players.push({
        nickname,
        ws
    });

    // 입장 성공 응답
    sendToClient(ws, {
        type: 'join_result',
        success: true
    });

    // 다른 플레이어들에게 새 플레이어 알림
    broadcastToRoom('main', {
        type: 'player_joined',
        nickname
    }, ws);

    // 새 플레이어에게 이미 방에 있는 다른 플레이어들 정보 전송
    const otherPlayers = room.players.filter(player => player.nickname !== nickname);
    if (otherPlayers.length > 0) {
        otherPlayers.forEach(player => {
            sendToClient(ws, {
                type: 'player_joined',
                nickname: player.nickname
            });
        });
    }

    // 두 명이 모이면 게임 시작
    if (room.players.length === 2 && !room.gameStarted) {
        startGame(room);
    }
}

function handleWordSubmission(ws, clientData, data) {
    const { nickname, room: roomName } = clientData;
    const room = rooms[roomName];
    
    if (!room || !room.gameStarted) {
        sendToClient(ws, {
            type: 'word_submitted',
            player: nickname,
            word: data.word,
            valid: false,
            message: '게임이 아직 시작되지 않았습니다.'
        });
        return;
    }
    
    if (room.currentTurn !== nickname) {
        sendToClient(ws, {
            type: 'word_submitted',
            player: nickname,
            word: data.word,
            valid: false,
            message: '당신의 턴이 아닙니다.'
        });
        return;
    }
    
    const word = data.word.trim();
    if (!word) {
        sendToClient(ws, {
            type: 'word_submitted',
            player: nickname,
            word: '',
            valid: false,
            message: '단어가 비어있습니다.'
        });
        return;
    }
    
    // 단어 규칙 검증
    const lastChar = room.currentWord.charAt(room.currentWord.length - 1);
    const firstChar = word.charAt(0);
    
    if (lastChar !== firstChar) {
        const message = {
            type: 'word_submitted',
            player: nickname,
            word,
            valid: false,
            message: `"${room.currentWord}"의 마지막 글자는 "${lastChar}"입니다. "${firstChar}"로 시작하는 단어는 사용할 수 없습니다.`
        };
        
        broadcastToRoom(roomName, message);
        
        // 패배 처리
        const winner = room.players.find(player => player.nickname !== nickname);
        if (winner) {
            broadcastToRoom(roomName, {
                type: 'game_over',
                winner: winner.nickname,
                loser: nickname,
                reason: '잘못된 첫 글자'
            });
        }
        
        // 게임 재시작
        setTimeout(() => {
            if (room.players.length >= 2) {
                startGame(room);
            }
        }, 3000);
        
        return;
    }
    
    // 한글 단어 검증 (간단한 정규식)
    const koreanWordRegex = /^[가-힣]+$/;
    if (!koreanWordRegex.test(word)) {
        const message = {
            type: 'word_submitted',
            player: nickname,
            word,
            valid: false,
            message: '한글 단어만 입력 가능합니다.'
        };
        
        broadcastToRoom(roomName, message);
        return;
    }
    
    // 단어 제출 성공
    room.currentWord = word;
    
    // 턴 변경
    const nextPlayer = room.players.find(player => player.nickname !== nickname);
    if (nextPlayer) {
        room.currentTurn = nextPlayer.nickname;
    }
    
    // 결과 브로드캐스트
    broadcastToRoom(roomName, {
        type: 'word_submitted',
        player: nickname,
        word,
        valid: true
    });
}

function handleChat(ws, clientData, data) {
    if (!clientData.nickname) return;
    
    const message = {
        type: 'chat',
        sender: clientData.nickname,
        content: data.content
    };
    
    broadcastToRoom(clientData.room, message);
}

// 게임 시작 함수
function startGame(room) {
    if (room.players.length < 2) return;
    
    room.gameStarted = true;
    room.currentWord = '코딩';
    
    // 랜덤으로 첫 플레이어 선택
    const randomIndex = Math.floor(Math.random() * room.players.length);
    room.currentTurn = room.players[randomIndex].nickname;
    
    // 게임 시작 메시지 브로드캐스트
    broadcastToRoom('main', {
        type: 'game_start',
        startWord: room.currentWord,
        firstTurn: room.currentTurn
    });
}

// 유틸리티 함수
function sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function broadcastToRoom(roomName, message, excludeWs = null) {
    const room = rooms[roomName];
    if (!room) return;
    
    room.players.forEach(player => {
        if (player.ws !== excludeWs && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(message));
        }
    });
} 