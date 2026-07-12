# 📚 BisnisMu — Indeks Lengkap Dokumentasi

Tempat terpusat untuk menemukan semua file documentation & resources BisnisMu.

---

## 🎯 Mulai dari sini (dalam urutan pembacaan)

### **1. Baca Pertama Kali** (30 menit)
| File | Apa | Untuk siapa |
|---|---|---|
| **BISNISMU_START_HERE.md** ⭐ | Overview proyek, langkah pertama, tips sukses | Semua orang |
| **BRAND_GUIDELINES_bisnismu.md** | Brand identity, naming convention, checklist | Product, marketing, engineering |
| **PRD_bisnismu.md** | Visi, fitur, roadmap 6 fase, success metrics | Product managers, engineers, investors |

### **2. Setup Environment** (2 jam)
| File | Apa | Tools yang dibutuhkan |
|---|---|---|
| **setup_claude_code_bisnismu.md** | Claude Code configuration: CLAUDE.md, MCP, skills, hooks, subagents | Claude Code CLI, MCP |
| **BISNISMU_START_HERE.md § Langkah Pertama** | Environment setup: Docker, PostgreSQL, monorepo pnpm | Docker, Node, pnpm, Git |

### **3. Database & Architecture** (study)
| File | Apa | Untuk |
|---|---|---|
| **skema_database_bisnismu_v2.sql** | Complete database schema: 17 table groups, 3 views, constraints | DBA, backend engineer, architect |
| **PRD_bisnismu.md § 5. Arsitektur** | Tech stack, diagram, struktur modul NestJS | Backend engineer, architect |

### **4. Development Reference** (konsultasi saat coding)
| File | Apa | Gunakan saat... |
|---|---|---|
| **setup_claude_code_bisnismu.md § 4. Skills** | Sales-engine, db-migration, new-module skills | Coding fitur, perubahan database, modul baru |
| **PRD_bisnismu.md § 4. User Flow Utama** | Transaction flow, open bill flow, kasbon flow | Implementasi sales module |

---

## 📂 File Inventory (Lengkap)

```
outputs/
├── INDEX_BISNISMU.md                    ← File ini
├── BISNISMU_START_HERE.md               ← Baca pertama! Panduan lengkap startup
├── BRAND_GUIDELINES_bisnismu.md         ← Brand identity & naming convention
├── PRD_bisnismu.md                      ← Product requirement document (fitur, roadmap, arsitektur)
├── setup_claude_code_bisnismu.md        ← Claude Code setup guide (CLAUDE.md template, MCP, skills)
├── skema_database_bisnismu_v2.sql       ← Database schema lengkap (SQL)
│
├── [Referensi/Historis — untuk perbandingan evolusi]
├── PRD_kasir_umkm.md                    ← PRD versi awal (sebelum rebrand BisnisMu)
├── setup_claude_code_kasir.md           ← Setup guide versi awal
├── skema_database_kasir_v1.sql          ← Schema versi 1 (minimal)
└── skema_database_kasir_v2.sql          ← Schema versi 2 (lengkap, asli)
```

---

## 🔍 Cari Topik Spesifik

### **Kalau pertanyaannya...**

| Pertanyaan | Buka file | Bagian |
|---|---|---|
| "Apa itu BisnisMu?" | BRAND_GUIDELINES | §1–2 |
| "Mulai dari mana?" | BISNISMU_START_HERE | Langkah Pertama |
| "Setup Docker & PostgreSQL gimana?" | BISNISMU_START_HERE | §1 (Hari 1–2) |
| "Setup Claude Code gimana?" | setup_claude_code_bisnismu | §3–7 |
| "Fitur apa aja di v1?" | PRD_bisnismu | §3 (Fitur Inti) |
| "Roadmap 6 fase gimana?" | PRD_bisnismu | §6 (Roadmap) |
| "Database schema gimana?" | skema_database_bisnismu_v2.sql | (baca SQL atau PRD §5) |
| "Bagaimana mesin transaksi penjualan?" | setup_claude_code_bisnismu | §4.a (skill sales-engine) |
| "Struktur NestJS modul gimana?" | PRD_bisnismu | §5.4 (Struktur Modul) |
| "Naming convention GitHub/Slack?" | BRAND_GUIDELINES | §2 |
| "Apa itu open bill?" | PRD_bisnismu | §4.2 (Flow Open Bill) |
| "Gimana dengan kasbon pelanggan?" | PRD_bisnismu | §4.3 (Flow Kasbon) |
| "Teknologi apa yang dipakai?" | PRD_bisnismu | §5.2 (Tech Stack) |
| "Risk & mitigation apa?" | PRD_bisnismu | §7 |

---

## ✅ Checklist Sebelum Mulai Fase 0

Pastikan sudah:
- [ ] Baca BRAND_GUIDELINES_bisnismu (10 mnt)
- [ ] Baca PRD_bisnismu §1–3 (20 mnt)
- [ ] Baca BISNISMU_START_HERE dari atas (30 mnt)
- [ ] Docker + PostgreSQL siap di lokal (5 mnt test)
- [ ] Node 20+ & pnpm installed (2 mnt)
- [ ] Claude Code installed & tested (5 mnt)
- [ ] GitHub/GitLab repo dibuat (5 mnt)
- [ ] SSH key setup untuk git push (5 mnt)

**Total persiapan: ~90 menit.** Setelah itu, siap Fase 0 dimulai!

---

## 🗺️ Roadmap Kapan Baca File Apa

```
MINGGU 1: Fase 0 (Foundation)
├─ Hari 1: Read BRAND_GUIDELINES, PRD summary, BISNISMU_START_HERE
├─ Hari 1–2: Setup environment (Docker, Node, pnpm)
├─ Hari 2–3: Read setup_claude_code, setup MCP + CLAUDE.md
├─ Hari 3–7: Implement Fase 0 (monorepo, prisma, auth)
│  └─ Reference: PRD §5 (Architecture), skema_database_bisnismu_v2.sql
└─ End of week: Commit ke main, KPI Fase 0 berhasil

MINGGU 2: Fase 1 (Core: Mesin Transaksi)
├─ Hari 1: Re-read PRD §4.1 (Sales Transaction Flow)
├─ Hari 1–2: Read setup_claude_code §4.a (skill sales-engine)
├─ Hari 2–5: Implement sales module, inventory, payment
│  └─ Reference: skema_database_bisnismu_v2.sql (transaction tables)
├─ Hari 5: Test konkurensi + unit tests
└─ Hari 6–7: UI kasir basic (Next.js)

MINGGU 3+: Fase 2, 3, 4...
├─ Reference PRD §6 (Roadmap) → bacakan sesuai fase
└─ Konsultasi setup_claude_code sesuai modul yang dibuat
```

---

## 📞 Q&A Cepat

**T: Saya bingung, harus mulai dari mana?**
A: Mulai dari BISNISMU_START_HERE.md § Langkah Pertama. Ikuti checklist hari per hari.

**T: Saya ingin tahu fitur apa aja yang ada di v1?**
A: Buka PRD_bisnismu.md § 3.1 (Fitur Inti).

**T: Gimana struktur database untuk fitur X?**
A: Lihat skema_database_bisnismu_v2.sql — cari nama tabel relevan. Atau chat dengan Claude Code, dia bisa query MCP postgres langsung.

**T: Gimana setup Claude Code untuk proyek ini?**
A: setup_claude_code_bisnismu.md § 1–7. Copy CLAUDE.md template, setup .mcp.json, dan skills.

**T: File mana yang harus disimpan di Git repo?**
A: Semua file `PRD_bisnismu.md`, `skema_database_bisnismu_v2.sql`, `setup_claude_code_bisnismu.md`, `BRAND_GUIDELINES_bisnismu.md` masuk ke `docs/` folder di repo. Jangan yang v0 (kasir_*), itu sudah usang.

**T: Database apa yang dipakai?**
A: PostgreSQL 16. Schema ada di skema_database_bisnismu_v2.sql.

**T: Teknologi apa yang dipakai?**
A: Backend: NestJS + Prisma + PostgreSQL. Frontend: Next.js + TypeScript + Tailwind. Deploy: Docker Compose.

**T: Bisa akses database dari Claude Code?**
A: Ya! setup_claude_code_bisnismu.md § 3 setup MCP postgres. Setelah itu, Claude bisa query langsung tanpa keluar terminal.

---

## 🎓 Learning Path (Opsional, tapi recommended)

Jika belum familiar dengan tech stack, cek resources:

**TypeScript fundamentals** (1–2 jam)
- Opsional, tapi helpful untuk memahami codebase BisnisMu

**NestJS basics** (2–3 jam)
- Decorator, modules, services, controllers
- https://docs.nestjs.com

**Prisma basics** (2–3 jam)
- Schema, models, relations, migrations
- https://www.prisma.io/docs
- *KRITIS untuk proyek ini*

**PostgreSQL basics** (1–2 jam)
- SELECT, UPDATE, JOIN, transactions
- https://www.postgresql.org/docs/16/

**Claude Code tutorial** (1 jam)
- Setup, Plan Mode, MCP servers
- https://code.claude.com/docs

*Total: ~10 jam. Bisa dicicil sambil mengerjakan Fase 0.*

---

## 📈 Version History

```
v1.0 (12 Juli 2026) — Documentation launch
├─ PRD_bisnismu.md (lengkap, roadmap 6 fase)
├─ setup_claude_code_bisnismu.md (template CLAUDE.md, MCP, skills)
├─ skema_database_bisnismu_v2.sql (17 table groups, 3 views)
├─ BRAND_GUIDELINES_bisnismu.md (brand identity, naming convention)
├─ BISNISMU_START_HERE.md (getting started, langkah pertama)
└─ INDEX_BISNISMU.md (file ini)
```

---

## 🤝 Support & Questions

Kalau ada yang kurang jelas atau ada pertanyaan:

1. **Topik teknis (database, code)** → Buka Claude Code di terminal, tanyakan (Claude punya akses ke semua docs)
2. **Topik produk/bisnis** → Refer ke PRD_bisnismu.md atau diskusi dengan team
3. **Setup/environment** → BISNISMU_START_HERE.md atau setup_claude_code_bisnismu.md
4. **Brand/naming** → BRAND_GUIDELINES_bisnismu.md

---

**Semoga dokumentasi ini membantu! Selamat memulai BisnisMu. 🚀**

---
