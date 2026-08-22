# DorizzStore Member Community Realtime

Backend realtime untuk UI `https://dorizzstore.com/member/community`. Service ini tidak memiliki UI publik dan tidak menyediakan DM, member directory, member search, atau private room.

## Environment

```bash
PORT=3001
COMMUNITY_JWT_SECRET=<secret-yang-sama-dengan-aplikasi-web>
COMMUNITY_DATABASE_URL=<postgres/neon-connection-string>
COMMUNITY_ALLOWED_ORIGINS=https://dorizzstore.com,https://www.dorizzstore.com
```

`COMMUNITY_JWT_SECRET` wajib berbeda dari `JWT_SECRET` login utama. Token komunitas menggunakan JWE `A256GCM`, sehingga internal member/admin ID tidak terlihat saat token berada di browser.

## Install dan jalankan

```bash
cd services/community-realtime
npm install --omit=dev
npm run check
npm start
```

Health check:

```bash
curl -fsS http://127.0.0.1:3001/health
```

Response sehat:

```json
{"ok":true,"database":true}
```

## Reverse proxy

Contoh Nginx untuk `chat.dorizzstore.com`:

```nginx
server {
    listen 443 ssl http2;
    server_name chat.dorizzstore.com;

    location /health {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 65s;
    }

    location / {
        return 404;
    }
}
```

## systemd

Contoh unit `/etc/systemd/system/dorizz-community.service`:

```ini
[Unit]
Description=DorizzStore Member Community Realtime
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/dorizz-community
EnvironmentFile=/etc/dorizz-community.env
ExecStart=/usr/bin/node server.mjs
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Setelah file dan environment tersedia:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dorizz-community
sudo systemctl status dorizz-community
```

## Web app

Environment yang dibutuhkan oleh aplikasi Next.js:

```bash
COMMUNITY_JWT_SECRET=<secret-yang-sama-dengan-service>
COMMUNITY_SOCKET_URL=https://chat.dorizzstore.com
```

Member tetap mengakses komunitas hanya dari `dorizzstore.com/member/community`. `chat.dorizzstore.com` adalah transport realtime di belakang layar.
