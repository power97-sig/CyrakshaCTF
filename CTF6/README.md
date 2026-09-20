# CTF 6: Split-Brain Protocol (Duo Interdependent Box)

## 📌 Overview
- **Category**: Hybrid (Web Exploitation + Reverse Engineering + Cryptography + Race Condition)
- **Base Points**: 1000 PTS
- **Target Architecture**:
  - **Port 8000**: Web Microservice & Invoice PDF Generator (SSRF / Memory Dump)
  - **Port 9000**: Raw TCP Custom Daemon (`protocol_bridge`, stripped x86-64 ELF)

---

## 🎯 Exploitation Phases

### Phase 1: The Split
- **Track 1 (Web)**: Bypass loopback regex filter (`127.0.0.1` / `localhost`) using `http://0.0.0.0:8000` or `/proc/self/mem` to leak the ephemeral 32-byte session secret.
- **Track 2 (Reversing)**: Decompile `protocol_bridge`, reverse the 4-round Feistel block cipher and `0x53504C54` (`SPLT`) packet structure.

### Phase 2: Cross-Pollination
- Player 2 uses the 32-byte session key from Player 1 to encrypt `AUTH_ROOT_DEBUG` and assemble the binary packet.

### Phase 3: Convergence & Heartbeat Alarm
- Connect to Port 9000 to spawn the debug shell.
- Player 1 sends keepalive beacons via `/api/v1/keepalive` every 15 seconds to prevent the `alarm(15)` watchdog from terminating the connection while Player 2 reads `/root/flag.txt`.
