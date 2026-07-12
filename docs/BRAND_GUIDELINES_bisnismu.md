# BisnisMu — Brand Guidelines & Naming Convention

**Tagline:** "Sistem bisnis lengkap untuk UMKM Indonesia"

**Misi:** Memberdayakan UMKM dengan teknologi POS/kasir universal yang sederhana, terjangkau, dan open-source — supaya owner bisa fokus tumbuh, bukan ribet dengan sistem.

---

## 1. Brand Identity

| Elemen | Spesifikasi |
|---|---|
| **Nama Resmi** | BisnisMu |
| **Singkatan** | BM (untuk akronim internal) |
| **Domain** | bisnismu.id (utama); bisnismu.app (fallback) |
| **GitHub Org** | github.com/bisnismu-dev |
| **NPM Org** | @bisnismu (untuk paket reusable) |
| **Email Official** | hello@bisnismu.id; support@bisnismu.id |
| **Social** | @bisnismu (Instagram/Twitter/LinkedIn) |
| **Logo Colors** | Hijau (trust, pertumbuhan) + Putih; alt: biru + orange (energi) |

---

## 2. Naming Convention di Repo

### Monorepo Structure
```
bisnismu/                                    # root
├── apps/
│   ├── api/          # "bisnismu-api" atau "@bisnismu/api"
│   ├── web/          # "bisnismu-web" atau "@bisnismu/web"
│   └── dashboard/    # owner/admin portal
├── packages/
│   ├── db/           # "@bisnismu/db" (prisma schema + client)
│   ├── sdk/          # "@bisnismu/sdk" (client SDK, nanti untuk mobile)
│   ├── types/        # "@bisnismu/types" (shared TS types)
│   └── ui/           # "@bisnismu/ui" (shadcn/ui + custom components)
├── docs/
├── .github/workflows/
└── docker-compose.yml
```

### Git Workflow
```
Branch naming:
  main              # production
  staging           # pre-production
  dev               # development (dari sini fitur cabang)
  feature/*         # feature/sales-engine, feature/booking-jasa
  fix/*             # fix/stok-race-condition
  docs/*            # docs/api-reference

Commit message:
  feat(sales): implement transaction engine
  fix(inventory): prevent negative stock
  docs(readme): add setup instructions
  refactor(api): restructure module sales
  test(payment): add concurrency tests
```

### Release & Versioning
- Semantic Versioning: v0.1.0 (MVP), v0.2.0 (Fase 2), v1.0.0 (siap produksi)
- Tag: `v0.1.0-alpha.1`, `v0.1.0-beta.1`, `v0.1.0` (production)
- Changelog: CHANGELOG.md, update otomatis saat release
- NPM/Docker: tag semua dari git tag `v*`

---

## 3. Dokumentasi & Content

### File README
Setiap folder punya README.md dengan struktur:
```markdown
# BisnisMu — [Nama Modul]
Bagian dari sistem bisnis lengkap untuk UMKM.

## Deskripsi
...

## Instalasi
...

## Kontribusi
Lihat CONTRIBUTING.md di root repo
```

### Dokumentasi Resmi (docs/)
```
docs/
├── README.md               # "Selamat datang di BisnisMu"
├── CONTRIBUTING.md         # Kontribusi ke BisnisMu
├── PRD_bisnismu.md         # PRD lengkap (update dari PRD_kasir_umkm.md)
├── architecture/
│   ├── overview.md         # "Arsitektur BisnisMu"
│   ├── database.md         # "BisnisMu Database Schema"
│   └── api.md              # "BisnisMu API Structure"
├── guides/
│   ├── setup.md            # "Setup BisnisMu untuk Development"
│   ├── database-migration.md
│   └── deployment.md       # "Deploy BisnisMu ke Production"
└── features/
    ├── sales/FEATURE.md    # "Fitur Penjualan BisnisMu"
    ├── inventory/FEATURE.md
    └── ...
```

### Marketing Copy (untuk nanti)
- **Hero tagline:** "BisnisMu: Kasir & bisnis all-in-one untuk UMKM"
- **Benefit bullets:**
  - ✓ Satu sistem untuk retail, F&B, jasa, grosir
  - ✓ Open-source & terjangkau (bisa self-hosted)
  - ✓ Fitur yang dibutuhkan UMKM Indonesia (kasbon, struk WA, laci kas, komisi)
  - ✓ Setup 15 menit, bukan seminggu

---

## 4. Code & Identifier Consistency

### Dalam Kode (comments, errors)
```typescript
// BisnisMu: sales engine — transaksi wajib dalam satu DB transaction
// BisnisMu error: ERR_BISNISMU_INSUFFICIENT_STOCK

// Identifier bisnis (tenant): business_id tetap dalam database,
// tapi di log/error boleh pakai business_slug jika lebih readable
console.error(`[BisnisMu] Transaction failed for business ${business_slug}`);
```

### Error Codes
```
BISNISMU_E001: Insufficient stock
BISNISMU_E002: Invalid business configuration
BISNISMU_E003: Transaction already void
BISNISMU_E404: Resource not found
BISNISMU_E500: Internal server error
```

### User-Facing UI
- Bahasa Indonesia di semua UI text
- Konsisten: "Kasir BisnisMu", "Dashboard BisnisMu", "Laporan BisnisMu"
- Menu item: "Kelola Produk BisnisMu", "Lihat Kasbon BisnisMu"

---

## 5. Fase Rollout Nama

### Fase 0–2 (MVP Development) — "Private Beta"
- Repo tetap internal (private) selama development
- Nama internal = BisnisMu, tapi belum ada launch resmi
- Dokumen internalnya sudah branded "BisnisMu" dari hari pertama

### Fase 3 (Beta Launch) — "Public Beta"
- Repo jadi public: github.com/bisnismu-dev
- Domain bersifat landing page (info, docs, demo — bukan live app)
- Marketing: "Bergabung beta tester BisnisMu"

### Fase 4+ (Production) — "General Availability"
- Peluncuran resmi BisnisMu
- App production: bisnismu.id/app (atau subdomain app.bisnismu.id)
- Blog, changelog, komunitas

---

## 6. Checklist Implementasi Nama BisnisMu

Sebelum di-commit ke repo, pastikan konsistensi:

- [ ] **Root repo:** folder `bisnismu/` atau GitHub `bisnismu-dev`
- [ ] **package.json root:** "name": "bisnismu" (atau private: true untuk sekarang)
- [ ] **README.md root:** heading "# BisnisMu — [deskripsi]"
- [ ] **CLAUDE.md:** "# BisnisMu — [deskripsi produk]"
- [ ] **docker-compose.yml:** service name `bisnismu-api`, `bisnismu-db`, `bisnismu-web`
- [ ] **CONTRIBUTING.md:** "Kontribusi ke BisnisMu"
- [ ] **PRD:** rename file → `PRD_bisnismu.md` (dari `PRD_kasir_umkm.md`)
- [ ] **Skema database:** file `bisnismu_schema_v2.sql` (dari `skema_database_kasir_v2.sql`)
- [ ] **Env variables:** `BISNISMU_API_URL`, `BISNISMU_DB_URL` (instead of generic KASIR_*)
- [ ] **GitHub Org:** create `github.com/bisnismu-dev`; invite collaborators
- [ ] **GitHub Actions:** workflow files: `.github/workflows/bisnismu-*.yml`
- [ ] **Docker Hub:** (nanti) docker image `bisnismu/api:latest`, `bisnismu/web:latest`
- [ ] **Docs site:** (nanti) MkDocs atau Docusaurus di `docs.bisnismu.id`

---

## 7. Contoh Kalimat Sehari-hari (internal team)

✅ **DO SAY:**
- "Fitur kasbon di BisnisMu sudah ready?"
- "Laporin saat deploy BisnisMu ke staging"
- "Kode sales-engine BisnisMu sudah selesai di-review"
- "Update CHANGELOG.md: tambahkan di 'BisnisMu v0.2.0'"

❌ **DON'T SAY:**
- "Aplikasi kasir itu"
- "Sistem POS universal"
- "Project UMKM"
- "Aplikasi itu" (terlalu vague)

---

Dengan branding ini, proyek jadi terasa **solid, professional, dan punya identitas sendiri** — bukan hanya "aplikasi kasir yang lain". Seiring waktu, BisnisMu bisa punya komunitas, ecosystem, dan mungkin jadi startup.

Sekarang saya akan **update seluruh dokumentasi yang sudah dibuat** (PRD, setup Claude Code, skema database) dengan branding BisnisMu. Persiapan sebelum dimulai Fase 0?
