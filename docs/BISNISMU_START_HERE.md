# BisnisMu — Ringkasan Dokumentasi & Langkah Pertama

Selamat! Proyek **BisnisMu** sudah memiliki foundation documentation lengkap. Di bawah ini adalah **peta jalan** dari riset hingga siap coding Fase 0.

---

## 📚 Dokumentasi yang Sudah Jadi (7 file)

| File | Tujuan | Untuk |
|---|---|---|
| **BRAND_GUIDELINES_bisnismu.md** | Brand identity, naming convention, checklist implementasi | Seluruh tim & repo |
| **PRD_bisnismu.md** | Product requirement document: visi, fitur, roadmap 6 fase | Product managers, engineers, stakeholders |
| **setup_claude_code_bisnismu.md** | Setup Claude Code dengan CLAUDE.md, MCP, skills, hooks, subagents | Development workflow dengan Claude Code |
| **skema_database_bisnismu_v2.sql** | Database schema lengkap: 17 tabel utama, view laporan, soft delete, multi-tenant | DBA, backend engineer, Claude Code |
| **skema_database_kasir_v1.sql** | Versi pertama (untuk referensi evolusi desain) | Dokumentasi historis |

### Tambahan referensi:
- **PRD_kasir_umkm.md** (v0) — untuk membandingkan evolusi
- **setup_claude_code_kasir.md** (v0) — untuk membandingkan

---

## 🎯 Core Values BisnisMu

```
Kami percaya:
• UMKM adalah tulang punggung ekonomi Indonesia
• Mereka butuh teknologi sederhana, bukan kompleks
• Open-source = kepercayaan, fleksibilitas, harga terjangkau
• Satu sistem bisa melayani retail, F&B, jasa — jika desain cukup hati-hati
• Developer yang membuat software harus mengerti domain yang mereka layani
```

---

## 🚀 Langkah Pertama: Setup Fase 0 (Minggu Depan)

### **Hari 1–2: Environment Siap**

```bash
# Di VM Ubuntu 24.04 Proxmox kamu (atau lokal)
mkdir -p ~/projects/bisnismu && cd ~/projects/bisnismu

# Setup monorepo pnpm
pnpm init -y
echo "{ \"packages\": [\"apps/*\", \"packages/*\"] }" > pnpm-workspace.yaml

# Direktori
mkdir -p apps/{api,web} packages/{db,types,ui,sdk}

# Setup Git
git init
git remote add origin https://github.com/bisnismu-dev/bisnismu.git
git branch -M main

# Docker
docker network create bisnismu
docker run -d --name bisnismu-pg \
  -e POSTGRES_USER=bisnismu -e POSTGRES_PASSWORD=bisnismu \
  -e POSTGRES_DB=bisnismu_dev \
  -p 5432:5432 \
  --network bisnismu \
  postgres:16-alpine

# Tunggu PostgreSQL siap
sleep 5 && psql -h localhost -U bisnismu -d bisnismu_dev -c "SELECT 1;"
```

### **Hari 2–3: Database Foundation**

```bash
# Setup Prisma
pnpm add -w prisma @prisma/client -D
pnpm exec prisma init

# Copy skema dari skema_database_bisnismu_v2.sql ke prisma/schema.prisma
# (Claude Code akan convert SQL → Prisma schema)

# Migrasi pertama
pnpm exec prisma migrate dev --name init_bisnismu

# Verifikasi di psql
psql -h localhost -U bisnismu -d bisnismu_dev \
  -c "\dt" \
  -c "\dv"
```

### **Hari 3–4: Konfigurasi Claude Code**

```bash
# Setup Claude Code di folder ini
npm install -g @anthropic-ai/claude-code
cd ~/projects/bisnismu
claude init

# Claude Code akan prompt — jawab:
# - Project name: "BisnisMu"
# - Model: Sonnet (default bagus)
# - Features: biarkan default

# Setup MCP
cat > .mcp.json <<'EOF'
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres",
               "postgresql://bisnismu:bisnismu@localhost:5432/bisnismu_dev"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
EOF

# Verifikasi MCP
claude mcp ls
```

### **Hari 4–5: Starter Backend (NestJS)**

```bash
# NestJS setup (Claude Code akan handle ini)
pnpm dlx @nestjs/cli@latest new api --skip-git

# Pindah ke apps/api
mv api/* apps/api/

# Setup packages/db untuk Prisma client shared
cd packages/db
pnpm init -y
# Setup prisma di sini, jangan di root

# Integrasikan di apps/api
# (Claude Code akan generate module Prisma provider)
```

### **Hari 5–6: Frontend Skeleton (Next.js)**

```bash
# Next.js
cd apps/web
pnpm create next-app@latest . --typescript --tailwind

# Setup state management
pnpm add zustand dexie  # untuk offline/cache
```

### **Hari 6–7: Commit & Push**

```bash
git add .
git commit -m "feat(init): BisnisMu foundation — monorepo, db schema, claude code setup"
git push origin main
```

---

## 📋 Checklist Sebelum Mulai Fase 0 di Claude Code

- [ ] **Clone/init repo** BisnisMu (GitHub org sudah jadi atau private repo di awal)
- [ ] **Docker PostgreSQL** jalan (port 5432 accessible)
- [ ] **Claude Code** installed & bisa jalankan `claude init`
- [ ] **pnpm** installed (v8+)
- [ ] **CLAUDE.md** sudah ada di root repo (gunakan template di setup_claude_code_bisnismu.md)
- [ ] **.mcp.json** dengan postgres + context7
- [ ] **.claude/settings.json** dengan 2 hooks (format + typecheck)
- [ ] **Skills** sudah di .claude/skills/ (sales-engine, db-migration, new-module)
- [ ] **Node.js** 20+ installed (cocok dengan NestJS latest)

---

## 🔄 Workflow Saat Coding Fase 0 (Model)

```
# Masuk VM, tmux/screen:
tmux new-session -s bisnismu -c ~/projects/bisnismu
tmux send-keys -t bisnismu "pnpm dev" Enter

# Buka CLI Claude Code di pane/window baru:
tmux new-window -t bisnismu -n claude
tmux send-keys -t bisnismu:claude "cd ~/projects/bisnismu && claude" Enter

# Plan Mode adalah default untuk fitur non-trivial:
# (di Claude Code)
>>> "Baca PRD Fase 0 bagian 'Fondasi', lalu buat struktur monorepo + integrasikan Prisma"
# (Claude akan buat plan, tunggu persetujuan Shift+Tab)

>>> "/approve"  # atau Shift+Tab → persetujuan interaktif

# Claude Code menjalankan, membuat folder/file/commit
# Terakhir: test
>>> "/test"  # jalankan pnpm test

# Jika ada error: Claude Code /clear lalu jelaskan ulang
>>> "/clear"
>>> "Ada error di prisma migration [paste error]. Bantuan?"
```

---

## 📞 Kapan Pakai Apa di Claude Code

| Situasi | Gunakan | Contoh |
|---|---|---|
| Setup awal monorepo | Plan Mode | "Setup monorepo pnpm + prisma + nestjs starter" |
| Bikin fitur baru | Plan Mode | "Implementasi F-01: autentikasi multi-tenant" |
| Fix bug sederhana | Direct (no plan) | "Fix: typo di validate email" |
| Debugging race condition | Subagent + MCP | "use subagent code-reviewer untuk analisis race condition di sales engine" |
| Database inspection | MCP postgres | "query: SELECT * FROM businesses LIMIT 5" (MCP execute) |
| Dokumentasi API | Skill | "gunakan skill /db-migration untuk update docs" |

---

## 🎓 Prasyarat Pengetahuan (minimal)

Sebelum mulai Fase 0, pastikan sudah familiar:

- **Git basics:** init, add, commit, push, branch, merge
- **Docker:** run container, docker-compose (sudah disediakan, tinggal `docker-compose up`)
- **TypeScript:** type annotations, interfaces, generics (Claude bantu, tapi dasar perlu)
- **NestJS:** decorator, modules, services, controllers (Claude akan generate, cukup pahami konsepnya)
- **SQL:** SELECT, UPDATE, JOIN, GROUP BY (akan pakai Prisma, tapi understand SQL penting)
- **Prisma:** schema.prisma, model, relation (Core dari proyek ini)

**Yang TIDAK perlu dihafal:** semua library API — Claude bisa referensi real-time via context7 MCP.

---

## 📈 KPI Fase 0 Berhasil

✅ **Fase 0 dinyatakan SELESAI jika:**
- [ ] Monorepo pnpm jalan: `pnpm install && pnpm dev` tanpa error
- [ ] Database: migrasi Prisma awal berhasil, 17 tabel + 3 view ada di PostgreSQL
- [ ] Auth modul dasar: register business → login email/password → JWT token → guard role
- [ ] CLAUDE.md + MCP + 3 skills terpasang, Claude Code bisa jalankan `claude mcp ls` & skills `/list`
- [ ] Satu user test bisa login dan liat feature flags (masih tidak ada UI, baru API)
- [ ] GitHub repo siap (public atau private, tapi organized)

**Timeframe:** ~1 minggu (itu bagus sekali).

---

## 🔗 File Referensi (dalam urutan baca)

1. **BRAND_GUIDELINES_bisnismu.md** ← baca dulu (5 mnt)
2. **PRD_bisnismu.md** ← pahami visi & Fase 0 (30 mnt)
3. **skema_database_bisnismu_v2.sql** ← lihat struktur (browse, 15 mnt)
4. **setup_claude_code_bisnismu.md** ← template CLAUDE.md & MCP (15 mnt)
5. **Mulai Fase 0** ← ikuti langkah di atas (7 hari)

---

## 💡 Tips Sukses

1. **Jangan perfectionist di awal.** Fase 0 cukup "foundation jalan", bukan "semua fitur sempurna". Kesempurnaan adalah Fase 1–2.

2. **Commit sering.** Setiap feature kecil → commit dengan pesan jelas (pakai Conventional Commit).

3. **Test dari awal.** Biarpun sederhana: `pnpm test` harus lulus. Ini jadi kebiasaan baik.

4. **CLAUDE.md adalah "memory" developer kamu.** Jika kamu harus menjelaskan hal yang sama 2×, itu sinyal tambah ke CLAUDE.md.

5. **MCP postgres adalah temanmu.** Query database langsung dari Claude Code lebih cepat dari klik GUI pgAdmin.

6. **Dokumentasi di repo dari hari 1.** `docs/` folder bukan "nanti aja" — mulai catat keputusan, link referensi, command yang sering dipakai.

---

## 🚨 Gotchas yang Perlu Dihindari

- ❌ Menggunakan `Number` atau `float` untuk uang. Always `NUMERIC` di DB, `Decimal` di JS (Prisma/Decimal.js).
- ❌ Lupa `business_id` di query. Ini akan jadi bug: data kebocoran antar tenant.
- ❌ Hard delete master data. Gunakan `deleted_at` soft delete.
- ❌ Tidak atomik transaksi penjualan. `prisma.$transaction()` WAJIB untuk semua operasi sales.
- ❌ Migrasi database manual (ALTER TABLE). Selalu via Prisma Migrate.
- ❌ Tidak backup skema & migration files. Git-track `prisma/migrations/` adalah WAJIB.

---

## 🎉 Sebelum Hari Pertama Coding

Pastikan siap:
```bash
# 1. Docker running
docker ps | grep bisnismu-pg

# 2. PostgreSQL accessible
psql -h localhost -U bisnismu -d bisnismu_dev -c "\l"

# 3. Claude Code installed
claude --version

# 4. Node + pnpm
node --version && pnpm --version

# 5. SSH key / GitHub auth siap (untuk push)
ssh -T git@github.com
```

Kalau semua ✓, **selamat! Siap memulai Fase 0 BisnisMu.**

---

**Next:** Saat siap, buka Claude Code di terminal dan prompt:
```
"Mulai Fase 0 BisnisMu: setup monorepo pnpm, inisialisasi Prisma,
convert skema SQL ke Prisma schema, migrasi database awal.
Baca terlebih dahulu docs/PRD_bisnismu.md bagian Fase 0."
```

Lalu tekan Shift+Tab untuk Plan Mode. Claude akan rancang langkah-langkah, kamu review & approve. Hitung mundur dimulai! 🚀

---

**Good luck! Kirim update setelah Fase 0 selesai, saya help code review & refine untuk Fase 1 (Mesin Transaksi Penjualan).**
