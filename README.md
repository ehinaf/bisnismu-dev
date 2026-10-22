# BisnisMu — Sistem Bisnis Lengkap untuk UMKM

Aplikasi kasir universal untuk warung makan, toko kelontong, salon, laundry, dan berbagai jenis usaha lainnya.

## 📚 Dokumentasi

**MULAI DI SINI:** [docs/INDEX_BISNISMU.md](docs/INDEX_BISNISMU.md)

### File Penting
- [Panduan Startup Fase 0](docs/BISNISMU_START_HERE.md)
- [Product Requirement Document](docs/PRD_bisnismu.md)
- [Brand Guidelines](docs/BRAND_GUIDELINES_bisnismu.md)
- [Claude Code Setup](docs/setup_claude_code_bisnismu.md)
- [Database Schema](docs/skema_database_bisnismu_v2.sql)
- [Final Checklist](docs/BISNISMU_FINAL_CHECKLIST.md)

## 🏗️ Tech Stack

- Backend: NestJS + Prisma + PostgreSQL 16
- Frontend: Next.js 15 + TypeScript + Tailwind CSS
- Development: Claude Code + MCP servers
- Deploy: Docker Compose

## 🚀 Quick Start

1. Baca [docs/INDEX_BISNISMU.md](docs/INDEX_BISNISMU.md)
2. Ikuti [docs/BISNISMU_START_HERE.md](docs/BISNISMU_START_HERE.md)
3. Setup Claude Code dengan [docs/setup_claude_code_bisnismu.md](docs/setup_claude_code_bisnismu.md)

## 🐳 Deploy (Docker Compose)

Satu VM (mis. di Proxmox) menjalankan semua layanan: PostgreSQL, migrasi, API, web, Caddy (satu pintu: web di `/`, API di `/api`), dan backup harian. HTTPS disediakan di depannya oleh **Cloudflare Tunnel** atau **Tailscale**.

### Pertama kali

```bash
cp .env.example .env        # isi PUBLIC_URL, POSTGRES_PASSWORD, JWT_ACCESS_SECRET, BACKUP_DIR
docker compose up -d --build
```

- `migrate` menjalankan `prisma migrate deploy` sekali; `api` baru jalan setelah migrasi sukses.
- Buka `PUBLIC_URL`, lalu daftarkan usaha pertama lewat halaman **Daftar**.
- Database tidak diekspos ke luar jaringan compose.

### Update versi

```bash
git pull
docker compose up -d --build   # migrasi baru otomatis diterapkan sebelum API jalan
```

### Akses dari luar

- **Cloudflare Tunnel:** isi `CLOUDFLARE_TUNNEL_TOKEN`, arahkan public hostname ke `http://caddy:80`, lalu `docker compose --profile tunnel up -d`.
- **Tailscale:** buka `http://<ip-tailscale-vm>:${HTTP_PORT}`, atau pakai Tailscale Serve untuk HTTPS.
- `TRUST_PROXY` (default `loopback,linklocal,uniquelocal`) membuat API membaca IP klien asli dari proxy, untuk pembatasan percobaan login dan log audit. Jangan dikosongkan di produksi.

### Backup & pemulihan

- **Otomatis:** `pg_dump` setiap hari pukul `BACKUP_TIME` ke `BACKUP_DIR`, disimpan `BACKUP_RETENTION_DAYS` hari. Arahkan `BACKUP_DIR` ke mount NAS supaya tidak ikut hilang bila VM rusak.
- **Manual:** `docker compose run --rm backup now`
- **Uji restore berkala:** `deploy/test-restore.sh` memulihkan backup terbaru ke database sementara, menampilkan jumlah baris tabel inti, lalu menghapusnya. Data produksi tidak disentuh.
- **Pulihkan produksi:** `deploy/restore.sh backups/bisnismu-YYYYmmdd-HHMMSS.dump`. Perintah ini menimpa data, menghentikan API selama proses, dan meminta konfirmasi.

---

**Open-source POS untuk UMKM Indonesia 🇮🇩**
