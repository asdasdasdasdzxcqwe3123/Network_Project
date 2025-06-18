document.addEventListener('DOMContentLoaded', function() {
    // DOM 요소
    const loginScreen = document.getElementById('login-screen');
    const gameScreen = document.getElementById('game-screen');
    const nicknameInput = document.getElementById('nickname');
    const joinBtn = document.getElementById('join-btn');
    const myNicknameSpan = document.getElementById('my-nickname');
    const opponentNicknameSpan = document.getElementById('opponent-nickname');
    const lastWordDisplay = document.getElementById('last-word');
    const wordInput = document.getElementById('word-input');
    const submitWordBtn = document.getElementById('submit-word');
    const gameBoard = document.getElementById('game-board');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('send-chat');
    const chatMessages = document.getElementById('chat-messages');
    const myInfoBox = document.getElementById('my-info');
    const opponentInfoBox = document.getElementById('opponent-info');

    // 게임 상태 변수
    let socket;
    let nickname = '';
    let currentWord = '코딩'; // 시작 단어
    let isMyTurn = false;

    // 소켓 연결 함수
    function connectWebSocket() {
        // WebSocket 서버 주소 (개발 중에는 로컬 주소 사용)
        const wsServerUrl = 'ws://' + window.location.hostname + ':8080';
        
        socket = new WebSocket(wsServerUrl);

        socket.onopen = function() {
            console.log('WebSocket 연결 성공!');
            // 닉네임 등록 메시지 전송
            socket.send(JSON.stringify({
                type: 'join',
                nickname: nickname
            }));
        };

        socket.onmessage = function(event) {
            const message = JSON.parse(event.data);
            
            switch(message.type) {
                case 'join_result':
                    handleJoinResult(message);
                    break;
                case 'player_joined':
                    handlePlayerJoined(message);
                    break;
                case 'game_start':
                    handleGameStart(message);
                    break;
                case 'word_submitted':
                    handleWordSubmitted(message);
                    break;
                case 'game_over':
                    handleGameOver(message);
                    break;
                case 'chat':
                    handleChatMessage(message);
                    break;
                case 'player_left':
                    handlePlayerLeft(message);
                    break;
            }
        };

        socket.onclose = function() {
            console.log('WebSocket 연결이 종료되었습니다.');
            addSystemMessage('서버와의 연결이 종료되었습니다. 페이지를 새로고침하여 다시 연결해주세요.');
        };

        socket.onerror = function(error) {
            console.error('WebSocket 에러:', error);
            addSystemMessage('서버 연결 중 오류가 발생했습니다.');
        };
    }

    // 이벤트 핸들러 함수
    function handleJoinResult(message) {
        if (message.success) {
            // 로그인 성공, 게임 화면으로 전환
            loginScreen.style.display = 'none';
            gameScreen.style.display = 'block';
            myNicknameSpan.textContent = nickname;
            addSystemMessage(`${nickname}님, 게임에 참가하셨습니다. 다른 플레이어를 기다리는 중...`);
        } else {
            // 로그인 실패
            alert(message.message || '게임 참가에 실패했습니다.');
        }
    }

    function handlePlayerJoined(message) {
        opponentNicknameSpan.textContent = message.nickname;
        addSystemMessage(`${message.nickname}님이 게임에 참가했습니다.`);
    }

    function handleGameStart(message) {
        currentWord = message.startWord || currentWord;
        lastWordDisplay.textContent = `현재 단어: ${currentWord}`;
        isMyTurn = message.firstTurn === nickname;
        updateTurnIndicator();
        addSystemMessage('게임이 시작되었습니다!');
    }

    function handleWordSubmitted(message) {
        const { player, word, valid, message: resultMessage } = message;
        const isMe = player === nickname;
        
        if (valid) {
            addWordToBoard(player, word, isMe);
            currentWord = word;
            lastWordDisplay.textContent = `현재 단어: ${currentWord}`;
            isMyTurn = !isMe; // 턴 전환
        } else {
            addSystemMessage(resultMessage || `${player}님의 단어가 규칙에 맞지 않습니다!`);
        }
        
        updateTurnIndicator();
    }

    function handleGameOver(message) {
        const { winner, loser, reason } = message;
        
        if (winner) {
            addSystemMessage(`🎉 ${winner}님이 승리했습니다! ${loser}님 패배: ${reason}`);
        } else {
            addSystemMessage(`게임이 종료되었습니다: ${reason}`);
        }
        
        isMyTurn = false;
        updateTurnIndicator();
    }

    function handleChatMessage(message) {
        const isMe = message.sender === nickname;
        addChatMessage(message.sender, message.content, isMe);
    }

    function handlePlayerLeft(message) {
        addSystemMessage(`${message.nickname}님이 게임을 떠났습니다.`);
        opponentNicknameSpan.textContent = '대기중...';
    }

    // UI 업데이트 함수
    function addWordToBoard(player, word, isMe) {
        const wordElement = document.createElement('div');
        wordElement.classList.add('word-container');
        
        if (isMe) {
            wordElement.classList.add('my-word');
            wordElement.textContent = `${word} (나)`;
        } else {
            wordElement.classList.add('other-word');
            wordElement.textContent = `(${player}) ${word}`;
        }
        
        gameBoard.appendChild(wordElement);
        gameBoard.scrollTop = gameBoard.scrollHeight;
    }

    function addSystemMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('word-container', 'system-message');
        messageElement.textContent = message;
        gameBoard.appendChild(messageElement);
        gameBoard.scrollTop = gameBoard.scrollHeight;
    }

    function addChatMessage(sender, content, isMe) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        
        if (isMe) {
            messageElement.classList.add('my-message');
            messageElement.textContent = `${content}`;
        } else {
            messageElement.classList.add('other-message');
            messageElement.textContent = `${sender}: ${content}`;
        }
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function updateTurnIndicator() {
        if (isMyTurn) {
            myInfoBox.classList.add('current-turn');
            opponentInfoBox.classList.remove('current-turn');
        } else {
            myInfoBox.classList.remove('current-turn');
            opponentInfoBox.classList.add('current-turn');
        }
    }

    // 이벤트 리스너 설정
    joinBtn.addEventListener('click', function() {
        nickname = nicknameInput.value.trim();
        if (nickname) {
            connectWebSocket();
        } else {
            alert('닉네임을 입력해주세요.');
        }
    });

    submitWordBtn.addEventListener('click', function() {
        submitWord();
    });

    wordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            submitWord();
        }
    });

    sendChatBtn.addEventListener('click', function() {
        sendChat();
    });

    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendChat();
        }
    });

    function submitWord() {
        if (!isMyTurn) {
            addSystemMessage('자신의 턴일 때만 단어를 제출할 수 있습니다.');
            return;
        }

        const word = wordInput.value.trim();
        if (!word) {
            alert('단어를 입력해주세요.');
            return;
        }

        // 클라이언트에서 기본 규칙 검증 (서버에서도 검증함)
        const lastChar = currentWord.charAt(currentWord.length - 1);
        const firstChar = word.charAt(0);
        
        if (lastChar !== firstChar) {
            addSystemMessage(`"${currentWord}"의 마지막 글자 "${lastChar}"로 시작하는 단어를 입력해주세요.`);
            return;
        }

        socket.send(JSON.stringify({
            type: 'submit_word',
            word: word
        }));

        wordInput.value = '';
    }

    function sendChat() {
        const content = chatInput.value.trim();
        if (!content) return;

        socket.send(JSON.stringify({
            type: 'chat',
            content: content
        }));

        chatInput.value = '';
    }
}); 