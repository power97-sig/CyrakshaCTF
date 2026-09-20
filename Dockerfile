FROM node:18-alpine

# Install Python 3, pip, and bash for CTF2 backend
RUN apk add --no-cache python3 py3-pip bash

WORKDIR /app

# Install root Node dependencies
COPY package*.json ./
RUN npm install --production

# Install CTF2 Python dependencies
COPY CTF2/requirements.txt ./CTF2/
RUN pip3 install --no-cache-dir -r ./CTF2/requirements.txt --break-system-packages

# Copy full application codebase
COPY . .

# Ensure entrypoint script is executable
RUN chmod +x /app/entrypoint.sh

ENV PORT=10000
EXPOSE 10000

CMD ["/app/entrypoint.sh"]
