#!/usr/bin/env python3
"""
Track 2 Reversing Solver: Feistel Block Cipher & Packet Assembler
"""

import sys
import struct
import time

MAGIC_HEADER = 0x53504C54  # "SPLT"

def feistel_encrypt(payload_bytes: bytes, key_bytes: bytes) -> bytes:
    # 4-round Feistel cipher matching protocol_bridge disassembly
    blocks = list(payload_bytes)
    while len(blocks) % 8 != 0:
        blocks.append(0x20)

    encrypted = []
    for b in range(0, len(blocks), 8):
        L = (blocks[b] << 24) | (blocks[b+1] << 16) | (blocks[b+2] << 8) | blocks[b+3]
        R = (blocks[b+4] << 24) | (blocks[b+5] << 16) | (blocks[b+6] << 8) | blocks[b+7]

        for round_idx in range(4):
            k = (key_bytes[(round_idx * 4) % len(key_bytes)] << 24) | \
                (key_bytes[(round_idx * 4 + 1) % len(key_bytes)] << 16) | \
                (key_bytes[(round_idx * 4 + 2) % len(key_bytes)] << 8) | \
                key_bytes[(round_idx * 4 + 3) % len(key_bytes)]

            F = (((R << 3) | (R >> 29)) ^ k ^ 0x5A5A5A5A) & 0xFFFFFFFF
            next_R = (L ^ F) & 0xFFFFFFFF
            L = R
            R = next_R

        encrypted.extend([
            (L >> 24) & 0xFF, (L >> 16) & 0xFF, (L >> 8) & 0xFF, L & 0xFF,
            (R >> 24) & 0xFF, (R >> 16) & 0xFF, (R >> 8) & 0xFF, R & 0xFF
        ])
    return bytes(encrypted)

def assemble_packet(session_secret_hex: str, command: str = "AUTH_ROOT_DEBUG") -> bytes:
    key_bytes = bytes.fromhex(session_secret_hex)
    payload_str = f"{command}:{session_secret_hex}".encode()
    encrypted_payload = feistel_encrypt(payload_str, key_bytes)
    
    # Pad payload to 64 bytes
    if len(encrypted_payload) < 64:
        encrypted_payload = encrypted_payload.ljust(64, b'\x00')
    else:
        encrypted_payload = encrypted_payload[:64]

    iv = bytes.fromhex("a1b2c3d4e5f60718293a4b5c6d7e8f90")
    timestamp = int(time.time())

    packet = struct.pack(">I", MAGIC_HEADER) + iv + struct.pack(">I", timestamp) + encrypted_payload
    return packet

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 solve_crypto.py <session_secret_hex>")
        sys.exit(1)
    
    secret = sys.argv[1]
    pkt = assemble_packet(secret)
    print(f"[+] Assembled Packet Hex: {pkt.hex()}")
