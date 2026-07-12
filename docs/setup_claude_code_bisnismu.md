# Setup Claude Code — Proyek BisnisMu
Disesuaikan untuk: VM Ubuntu 24.04 di Proxmox + Tailscale + tmux + VS Code
Stack proyek: NestJS + Prisma + PostgreSQL + Next.js (monorepo)

---

## Prinsip
Setup sekecil mungkin — setiap MCP server, skill, hook, dan subagent harus punya alasan jelas. Urutan pemasangan:
1. CLAUDE.md (konteks permanen)
2. MCP server (akses sistem eksternal: DB, GitHub, docs)
3. Skills (workflow berulang)
4. Hooks (otomasi & rel pengaman)
5. Subagents (pekerjaan terisolasi: review, riset)

Aturan memilih:
- Instruksi yang harus berlaku SETIAP turn → **CLAUDE.md**
- Prosedur yang dipakai kadang-kadang → **skill**
- Skrip yang harus jalan otomatis → **hook**
- Butuh akses sistem eksternal → **MCP**
- Riset/review yang memenuhi context → **subagent**

---

## 1. Struktur Direktori Proyek

```
kasir-umkm/
├── CLAUDE.md                      # konteks utama (ringkas, <150 baris)
├── .mcp.json                      # MCP scope project (masuk git)
├── .claude/
│   ├── settings.json              # permissions (masuk git)
│   ├── skills/
│   │   ├── sales-engine/SKILL.md
│   │   ├── db-migration/SKILL.md
│   │   └── new-module/SKILL.md
│   ├── agents/
│   │   ├── code-reviewer.md
│   │   └── schema-guard.md
│   └── hooks/  (skrip yang dipanggil settings.json)
├── docs/
│   ├── PRD_kasir_umkm.md          # PRD dari percakapan ini
│   └── skema_database_kasir_v2.sql
├── apps/
│   ├── api/                       # NestJS
│   └── web/                       # Next.js
└── packages/db/                   # Prisma schema + client
```

Langkah pertama di dalam repo: jalankan `/init`, lalu pangkas hasilnya.

---

## 2. CLAUDE.md (template siap pakai)

> Jaga tetap ringkas (~100–150 baris). CLAUDE.md yang terlalu panjang mulai diabaikan model. Detail panjang pindahkan ke skills/docs.

```markdown
# BisnisMu — BisnisMu Universal untuk UMKM Indonesia

## Konteks
BisnisMu web multi-tenant untuk retail/F&B/jasa/grosir dalam satu codebase.
Fitur per tenant dikontrol feature flags di business_settings (enable_tables,
enable_kasbon, enable_bookings, dst).
Dokumen acuan: docs/PRD_kasir_umkm.md dan docs/skema_database_kasir_v2.sql
— SELALU baca PRD sebelum implementasi fitur baru.

## Stack
- apps/api: NestJS + Prisma + PostgreSQL 16 (modular monolith)
- apps/web: Next.js 15 + TypeScript + Tailwind + Zustand
- Monorepo pnpm workspaces. Deploy: Docker Compose.

## Perintah
- pnpm dev            # jalankan api + web
- pnpm test           # unit test (wajib lulus sebelum selesai)
- pnpm test:e2e       # e2e api
- pnpm db:migrate     # prisma migrate dev
- pnpm db:seed        # data contoh
- pnpm lint && pnpm typecheck

## Aturan Wajib (non-negotiable)
1. UANG: selalu NUMERIC/Decimal — JANGAN PERNAH float/Number untuk nilai uang.
2. TRANSAKSI PENJUALAN: semua operasi penjualan dalam SATU prisma.$transaction:
   nomor struk (document_counters, atomik) → insert transaksi + item (snapshot
   nama/harga/HPP) → kurangi stok (SELECT FOR UPDATE) → stock_movements → payments.
3. MULTI-TENANT: setiap query WAJIB terfilter business_id. Tidak ada pengecualian.
4. SNAPSHOT: tabel transaction_* menyimpan salinan nama/harga saat transaksi;
   jangan join ke master data untuk nilai historis.
5. SOFT DELETE: master data pakai deleted_at, jangan hard delete.
6. Migrasi skema hanya via Prisma Migrate — jangan ALTER TABLE manual.
7. Aksi sensitif (void, ubah harga, refund) wajib tercatat di audit_logs.

## Konvensi
- Bahasa: kode + identifier Inggris; UI text & komentar domain Indonesia.
- Istilah domain: kasbon = piutang pelanggan; laci = cash drawer;
  struk = receipt; HPP = cost of goods sold.
- Module NestJS per domain (sales, catalog, inventory, ...) — lihat PRD §5.4.
- DTO tervalidasi (class-validator) untuk semua endpoint.
- Error response konsisten: { code, message, details? }.

## Workflow
- Fitur non-trivial: mulai dengan Plan Mode, tunggu persetujuan.
- Setelah edit: jalankan test terkait + typecheck sebelum menyatakan selesai.
- Uji konkurensi wajib untuk perubahan pada modul sales/inventory.
```

---

## 3. MCP Servers (.mcp.json — scope project)

Pasang sedikit tapi tepat. MCP mahal secara context, jadi hanya yang menghilangkan copy-paste rutin:

| MCP | Untuk apa | Prioritas |
|---|---|---|
| **PostgreSQL** | Claude bisa query DB dev langsung: inspeksi skema, verifikasi hasil migrasi, cek data test | Wajib |
| **Context7** | Dokumentasi ter-versi NestJS/Prisma/Next.js — mencegah API halusinasi/usang | Wajib |
| **GitHub** | Baca/buat issue & PR tanpa keluar terminal | Opsional (CLI `gh` sering cukup) |
| **Playwright** | Uji e2e layar kasir di browser (fase UI) | Nanti, saat Fase 1 UI |

`.mcp.json` di root repo:
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres",
               "postgresql://kasir:kasir@localhost:5432/kasir_dev"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

Catatan keamanan:
- Connection string di .mcp.json HANYA database dev lokal. Kredensial produksi tidak pernah masuk file yang di-commit.
- Verifikasi perintah & nama paket terbaru di https://code.claude.com/docs (MCP bergerak cepat).

---

## 4. Skills (.claude/skills/)

Skill = prosedur berulang. Tiga yang paling berguna untuk proyek ini:

### a. `sales-engine/SKILL.md` — pengetahuan modul paling kritis
```markdown
---
name: sales-engine
description: Aturan lengkap mesin transaksi penjualan. Gunakan setiap kali
  mengubah kode di modules/sales, inventory, atau payment.
---
# Mesin Transaksi Penjualan

## Urutan wajib dalam satu prisma.$transaction
1. Nomor struk: UPDATE document_counters SET last_number = last_number + 1
   WHERE business_id=? AND outlet_id=? AND doc_type='transaction'
   AND period=CURRENT_DATE RETURNING last_number
   (INSERT ON CONFLICT jika baris belum ada)
2. Insert transactions (status sesuai flow: 'completed' retail,
   'open' untuk dine-in open bill)
3. Insert transaction_items dengan SNAPSHOT: item_name_snapshot,
   unit_price, unit_cost_snapshot
4. Pengurangan stok — bergantung tipe item:
   - track_stock=true, use_recipe=false → kurangi inventory item itu
   - use_recipe=true → kurangi stok tiap bahan di recipes
   - item_type='bundle' → kurangi tiap komponen di bundle_components
   - track_stock=false (jasa) → lewati
   Selalu: SELECT ... FOR UPDATE pada baris inventory sebelum update.
   Stok tidak boleh negatif → lempar error, rollback seluruh transaksi.
5. Insert stock_movements (movement_type='sale_out' / 'recipe_out')
6. Insert payments; hitung fee_amount dari payment_channels
7. Jika pelanggan: update total_spent, visit_count, poin (jika loyalty aktif)
8. Jika kasbon: insert customer_receivables + cek credit_limit SEBELUM commit

## Test wajib untuk setiap perubahan
- Konkurensi: 2 request paralel beli stok terakhir → tepat 1 sukses
- Nomor struk: 20 request paralel → 20 nomor unik berurutan
- Rollback: stok tidak berubah jika langkah mana pun gagal
```

### b. `db-migration/SKILL.md`
```markdown
---
name: db-migration
description: Prosedur mengubah skema database dengan aman via Prisma.
---
1. Baca docs/skema_database_kasir_v2.sql sebagai sumber kebenaran desain
2. Edit packages/db/prisma/schema.prisma
3. pnpm db:migrate -- --name <deskripsi_singkat>
4. Periksa SQL migrasi yang dihasilkan SEBELUM apply — pastikan tidak ada
   DROP yang tidak disengaja
5. Update seeder jika tabel baru butuh data contoh
6. Jalankan pnpm test — pastikan tidak ada yang rusak
7. Verifikasi via MCP postgres: \d <tabel> sesuai harapan
```

### c. `new-module/SKILL.md`
Checklist membuat modul NestJS baru: module + controller + service + DTO + guard business_id + unit test + registrasi di app.module — supaya setiap modul konsisten bentuknya.

---

## 5. Hooks (.claude/settings.json)

Dua hook cukup untuk awal — satu pengaman, satu penjaga kualitas:

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm test:*)", "Bash(pnpm lint)", "Bash(pnpm typecheck)",
      "Bash(pnpm db:migrate:*)", "Bash(git status)", "Bash(git diff:*)"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(*prisma migrate reset*)",
      "Read(.env.production)",
      "Bash(*DROP TABLE*)", "Bash(*DROP DATABASE*)",
      "Bash(*TRUNCATE*)"
    ]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command",
                    "command": "pnpm exec prettier --write \"$CLAUDE_FILE_PATHS\" 2>/dev/null || true" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command",
                    "command": "pnpm typecheck || echo 'BLOCKED: perbaiki type error sebelum selesai'" }]
      }
    ]
  }
}
```

Intinya: format otomatis setiap edit; typecheck harus lulus sebelum Claude boleh menyatakan selesai; perintah destruktif database diblokir permanen.

---

## 6. Subagents (.claude/agents/)

Dua saja di awal — beri konteks SEMPIT, bukan seluruh proyek:

### `code-reviewer.md`
```markdown
---
name: code-reviewer
description: Review diff sebelum commit. Read-only.
tools: Read, Grep, Glob, Bash(git diff:*)
model: sonnet
---
Review perubahan kode dengan fokus KHUSUS proyek BisnisMu ini:
1. Uang memakai Decimal, bukan float?
2. Query baru terfilter business_id?
3. Operasi stok/penjualan di dalam prisma.$transaction dengan FOR UPDATE?
4. Nilai historis pakai kolom snapshot, bukan join master?
5. Aksi sensitif tercatat ke audit_logs?
6. Kebocoran secret / SQL injection / validasi input hilang?
Laporkan per file: masalah (dengan baris), tingkat keparahan, saran fix.
```

### `schema-guard.md`
Subagent read-only yang membandingkan schema.prisma terhadap docs/skema_database_kasir_v2.sql dan menandai penyimpangan desain (kolom snapshot hilang, soft delete terlupa, index hilang) — panggil setiap selesai migrasi.

---

## 7. Workflow Harian yang Disarankan

```
tmux attach → claude (di root repo)
│
├─ Fitur baru:
│   1. "Baca docs/PRD_kasir_umkm.md bagian Fase X, lalu rencanakan
│      implementasi F-0Y" → Plan Mode (Shift+Tab)
│   2. Review rencana → setujui → Claude implementasi
│   3. Claude jalankan test (hook Stop memaksa typecheck lulus)
│   4. "gunakan subagent code-reviewer untuk review diff ini"
│   5. Commit
│
├─ Perubahan skema: skill /db-migration → schema-guard verifikasi
├─ Sesi panjang: /compact di batas antar-task, /clear saat ganti topik besar
└─ Kesalahan yang berulang 2× → tambahkan 1 baris aturan ke CLAUDE.md
```

Tips model & mode:
- Sonnet sebagai default harian; naikkan ke Opus untuk desain arsitektur
  atau debugging konkurensi yang rumit; subagent review cukup Sonnet/Haiku.
- Plan Mode untuk semua pekerjaan multi-file (kebiasaan yang sudah kamu punya).
- /init sekali di awal, lalu pangkas hasilnya menjadi CLAUDE.md di atas.

---

## 8. Urutan Setup (checklist hari pertama)

- [ ] Buat repo + struktur monorepo pnpm
- [ ] Salin PRD & skema SQL ke docs/
- [ ] Docker Compose: PostgreSQL 16 (database kasir_dev)
- [ ] Tulis CLAUDE.md (template §2)
- [ ] .mcp.json: postgres + context7 → verifikasi dengan /mcp
- [ ] .claude/settings.json: permissions + 2 hooks
- [ ] Skill sales-engine + db-migration
- [ ] Subagent code-reviewer
- [ ] Sesi pertama: "Konversi docs/skema_database_kasir_v2.sql menjadi
      packages/db/prisma/schema.prisma, lalu buat migrasi awal" (Plan Mode)

Referensi resmi (fitur Claude Code berubah cepat, cek berkala):
- Docs: https://code.claude.com/docs
- MCP: https://code.claude.com/docs → bagian MCP
