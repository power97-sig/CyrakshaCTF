#!/usr/bin/env python3
"""
Track 1: Web Microservice & PDF Invoice Generator (Port 8000)
"""

import os
import re
import time
import secrets
import subprocess
from flask import Flask, request, jsonify, render_template_string

app = Flask(__name__)

# Generate Ephemeral 32-Byte Secret & write to /tmp for daemon
SESSION_SECRET = secrets.token_hex(16)
with open("/tmp/session_secret.key", "wb") as f:
    f.write(bytes.fromhex(SESSION_SECRET))

LAST_KEEPALIVE = time.time()

@app.route('/')
def index():
    return jsonify({
        "service": "Cyraksha Invoice Microservice",
        "version": "2.6.0",
        "port": 8000,
        "endpoints": ["/api/v1/invoice/render", "/api/v1/keepalive"]
    })

@app.route('/api/v1/invoice/render', methods=['POST'])
def render_invoice():
    data = request.get_json() or {}
    target_url = data.get('template_url', '')

    if not target_url:
        return jsonify({"error": "template_url is required"}), 400

    # Blind SSRF Blacklist Filter
    if re.search(r'(127\.0\.0\.1|localhost)', target_url, re.IGNORECASE):
        return jsonify({"error": "Security violation: Loopback target blocked by regex policy"}), 403

    # If bypass target or heap probe
    if '0.0.0.0' in target_url or '2130706433' in target_url or '/proc/self' in target_url or 'dump-heap' in target_url:
        return jsonify({
            "status": "success",
            "pdf_job_id": secrets.token_hex(8),
            "internal_debug_leak": {
                "heap_segment": "0x7fff5bc00000-0x7fff5bc20000",
                "ephemeral_secret_key": SESSION_SECRET,
                "protocol_bridge_port": 9000
            }
        })

    return jsonify({"status": "rendered", "pdf_url": "/static/invoices/sample.pdf"})

@app.route('/api/internal/debug/dump-heap')
def dump_heap():
    return jsonify({
        "heap_dump": f"EPHEMERAL_SECRET:{SESSION_SECRET}",
        "port": 9000
    })

@app.route('/api/v1/keepalive', methods=['POST'])
def keepalive():
    global LAST_KEEPALIVE
    LAST_KEEPALIVE = time.time()
    # Signal daemon process or touch keepalive file
    try:
        with open("/tmp/keepalive_beacon", "w") as f:
            f.write(str(LAST_KEEPALIVE))
    except Exception:
        pass
    return jsonify({"status": "heartbeat_received", "extended_seconds": 15})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
