#!/bin/bash
set -e

export PORT="${PORT:-10000}"
echo "================================================="
echo " 🔥 STARTING CYRAKSHA CTF ARENA ON RENDER"
echo " 🌐 PORT: $PORT"
echo "================================================="

cd /app && exec node server.js
