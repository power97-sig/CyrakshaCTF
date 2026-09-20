/**
 * Split-Brain Protocol Bridge Daemon (Port 9000)
 * Binary Reverse Engineering Target (Track 2)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>
#include <signal.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/types.h>

#define PORT 9000
#define MAGIC_HEADER 0x53504C54 // "SPLT"
#define TIMEOUT_SECONDS 15

typedef struct {
    uint32_t magic;
    uint8_t  iv[16];
    uint32_t timestamp;
    uint8_t  payload[64];
} __attribute__((packed)) Packet_t;

static volatile int heartbeat_extended = 0;

void handle_alarm(int sig) {
    if (heartbeat_extended) {
        heartbeat_extended = 0;
        alarm(TIMEOUT_SECONDS);
        return;
    }
    printf("\n[!] ALARM(15) SIGNAL TRIGGERED: Session heartbeat timeout! Watchdog closing socket.\n");
    exit(1);
}

void feistel_decrypt(uint8_t *payload, int len, const uint8_t *key) {
    for (int b = 0; b < len; b += 8) {
        uint32_t L = (payload[b] << 24) | (payload[b+1] << 16) | (payload[b+2] << 8) | payload[b+3];
        uint32_t R = (payload[b+4] << 24) | (payload[b+5] << 16) | (payload[b+6] << 8) | payload[b+7];

        for (int round = 3; round >= 0; round--) {
            uint32_t k = (key[(round * 4) % 32] << 24) |
                         (key[(round * 4 + 1) % 32] << 16) |
                         (key[(round * 4 + 2) % 32] << 8) |
                         key[(round * 4 + 3) % 32];

            uint32_t F = (((L << 3) | (L >> 29)) ^ k ^ 0x5A5A5A5A);
            uint32_t prevL = R ^ F;
            R = L;
            L = prevL;
        }

        payload[b]   = (L >> 24) & 0xFF;
        payload[b+1] = (L >> 16) & 0xFF;
        payload[b+2] = (L >> 8) & 0xFF;
        payload[b+3] = L & 0xFF;
        payload[b+4] = (R >> 24) & 0xFF;
        payload[b+5] = (R >> 16) & 0xFF;
        payload[b+6] = (R >> 8) & 0xFF;
        payload[b+7] = R & 0xFF;
    }
}

int main() {
    int server_fd, client_fd;
    struct sockaddr_in address;
    int opt = 1;
    socklen_t addrlen = sizeof(address);

    signal(SIGALRM, handle_alarm);

    if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) == 0) {
        perror("socket failed");
        exit(EXIT_FAILURE);
    }

    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);

    if (bind(server_fd, (struct sockaddr *)&address, sizeof(address)) < 0) {
        perror("bind failed");
        exit(EXIT_FAILURE);
    }

    if (listen(server_fd, 5) < 0) {
        perror("listen failed");
        exit(EXIT_FAILURE);
    }

    printf("[*] Protocol Bridge Daemon listening on port %d...\n", PORT);

    while (1) {
        client_fd = accept(server_fd, (struct sockaddr *)&address, &addrlen);
        if (client_fd < 0) continue;

        Packet_t pkt;
        ssize_t bytes_read = read(client_fd, &pkt, sizeof(Packet_t));
        if (bytes_read == sizeof(Packet_t) && ntohl(pkt.magic) == MAGIC_HEADER) {
            uint8_t session_key[32] = {0};
            FILE *f = fopen("/tmp/session_secret.key", "rb");
            if (f) {
                fread(session_key, 1, 32, f);
                fclose(f);
            }

            feistel_decrypt(pkt.payload, 64, session_key);

            if (strncmp((char *)pkt.payload, "AUTH_ROOT_DEBUG", 15) == 0) {
                dprintf(client_fd, "[✓] AUTHENTICATION GRANTED! Spawning debug console...\n");
                alarm(TIMEOUT_SECONDS);
                // Interactive shell session loop
                char buf[256];
                while (1) {
                    dprintf(client_fd, "root@splitbrain:~# ");
                    int n = read(client_fd, buf, sizeof(buf) - 1);
                    if (n <= 0) break;
                    buf[n] = '\0';
                    if (strncmp(buf, "cat /root/flag.txt", 18) == 0) {
                        dprintf(client_fd, "CYRAKSHA{SPL1T_BR41N_PR0T0C0L_DUO_M4ST3R}\n");
                    }
                }
            }
        }
        close(client_fd);
    }
    return 0;
}
