FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    gcc \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install flask requests

WORKDIR /app
COPY src/ /app/
COPY README.md /app/

# Compile stripped daemon
RUN gcc -O2 /app/protocol_bridge.c -o /usr/local/bin/protocol_bridge && strip /usr/local/bin/protocol_bridge

# Create flag
RUN mkdir -p /root && echo "CYRAKSHA{SPL1T_BR41N_PR0T0C0L_DUO_M4ST3R}" > /root/flag.txt

# Supervisor configuration
RUN echo "[supervisord]\nnodaemon=true\n\n[program:web]\ncommand=python3 /app/server.py\nautostart=true\nautorestart=true\n\n[program:daemon]\ncommand=/usr/local/bin/protocol_bridge\nautostart=true\nautorestart=true\n" > /etc/supervisor/conf.d/supervisord.conf

EXPOSE 8000 9000

CMD ["/usr/bin/supervisord"]
