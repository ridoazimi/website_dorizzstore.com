# DorizzStore Member Community Realtime

Backend realtime untuk UI `https://dorizzstore.com/member/community`. Service ini dideploy sebagai project Vercel terpisah dari folder `services/community-realtime`, tetapi tidak memiliki UI publik dan tidak menjadi platform terpisah bagi member.

Service hanya menyediakan satu grup Member DorizzStore. Tidak ada DM, member directory, member search, arbitrary room, atau private room.

## Arsitektur

```text
dorizzstore.com/member/community
        |
        | token komunitas JWE
        v
Vercel realtime service (Socket.IO / WebSocket only)
        |
        +--> Neon pooled connection untuk query
        |
        +--> Neon direct connection LISTEN/NOTIFY untuk event antar-instance
```

Vercel dapat menjalankan lebih dari satu function instance. Karena itu broadcast tidak hanya memakai memory satu instance. Event `message:new`, `message:deleted`, dan perubahan restriction dipublikasikan melalui PostgreSQL `LISTEN/NOTIFY`, lalu masing-masing instance meneruskannya ke socket yang sedang terhubung pada instance tersebut.

## Vercel project

Buat project Vercel dengan Root Directory:

```text
capcut-pro-dashboard/services/community-realtime
```

Fluid Compute diaktifkan melalui `vercel.json`. Socket.IO hanya menerima transport WebSocket.

Endpoint publik yang dipakai:

```text
/socket.io/*  -> Vercel Function api/socket-io.mjs
/health       -> Vercel Function api/health.mjs
```

Domain teknis yang disarankan:

```text
https://chat.dorizzstore.com
```

Member tetap hanya membuka `https://dorizzstore.com/member/community`.

## Environment realtime service

```bash
COMMUNITY_JWT_SECRET=<secret-yang-sama-dengan-web-app>
COMMUNITY_DATABASE_URL=<Neon pooled connection string>
COMMUNITY_LISTENER_DATABASE_URL=<Neon direct/non-pooled connection string>
COMMUNITY_ALLOWED_ORIGINS=https://dorizzstore.com,https://www.dorizzstore.com
```

`COMMUNITY_JWT_SECRET` wajib berbeda dari `JWT_SECRET` login utama. Token komunitas menggunakan JWE `A256GCM`, sehingga ID internal member/admin tidak terlihat saat token berada di browser.

`COMMUNITY_LISTENER_DATABASE_URL` harus menggunakan koneksi direct/non-pooled karena PostgreSQL `LISTEN` membutuhkan koneksi session yang tetap.

## Web app environment

Aplikasi Next.js DorizzStore membutuhkan:

```bash
COMMUNITY_JWT_SECRET=<secret-yang-sama-dengan-realtime-service>
COMMUNITY_SOCKET_URL=https://chat.dorizzstore.com
```

Tidak ada `NEXT_PUBLIC` secret. Browser hanya menerima URL socket dan token komunitas berumur pendek dari endpoint auth DorizzStore.

## Checks

Syntax check service:

```bash
npm run check
```

Setelah preview/deployment realtime tersedia, health check harus mengembalikan status sehat:

```bash
curl -fsS https://<realtime-preview-or-domain>/health
```

Expected:

```json
{"ok":true,"database":true}
```

Smoke test realtime minimal:

1. Member A dan Member B membuka `/member/community`.
2. A mengirim pesan; B menerima tanpa refresh.
3. Putuskan koneksi B lalu kirim pesan dari A; setelah reconnect, B mengambil gap dari history.
4. Admin delete/mute/ban harus terlihat pada koneksi yang berada di instance berbeda juga.
5. Tidak ada event atau endpoint member list/search/DM.

## Tidak digunakan

Deployment ini tidak membutuhkan:

- VPS
- Nginx
- systemd
- Redis
- server yang dikelola manual
