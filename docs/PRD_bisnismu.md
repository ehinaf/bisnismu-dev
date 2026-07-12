# PRD — BisnisMu — Sistem Bisnis Lengkap untuk UMKM
**Versi:** 1.0 · **Tanggal:** 12 Juli 2026 · **Status:** Draft

---

## 1. Ringkasan Produk

### 1.1 Visi
Satu BisnisMu (BisnisMu) berbasis web yang bisa dipakai berbagai jenis UMKM — warung makan, toko kelontong, salon, laundry, bengkel, hingga grosir — tanpa perlu aplikasi terpisah per jenis usaha. Fitur menyesuaikan jenis usaha melalui konfigurasi, bukan kode terpisah.

### 1.2 Masalah yang Diselesaikan
1. Banyak UMKM masih mencatat penjualan manual (buku tulis) — rawan hilang, tidak bisa dianalisis.
2. Aplikasi kasir yang ada umumnya kaku: aplikasi F&B tidak cocok untuk laundry, aplikasi retail tidak punya konsep booking.
3. Kebutuhan khas Indonesia sering tidak terakomodasi: kasbon pelanggan, pembayaran QRIS dengan biaya MDR, struk via WhatsApp.
4. Owner tidak tahu laba bersih karena pengeluaran operasional tidak tercatat di sistem yang sama.

### 1.3 Target Pengguna
| Persona | Peran | Kebutuhan Utama |
|---|---|---|
| **Owner UMKM** | Pemilik usaha | Laporan omzet & laba, kontrol stok, pantau multi-cabang dari HP |
| **Kasir** | Operator harian | Input transaksi cepat (< 30 detik), buka/tutup laci, cetak struk |
| **Manajer/Admin** | Pengelola outlet | Kelola produk, stok, karyawan, diskon |
| **Karyawan Jasa** | Kapster/teknisi | Lihat jadwal booking, lacak komisi |

### 1.4 Jenis Usaha yang Didukung (v1)
- **Retail:** toko kelontong, fashion, minimarket
- **F&B:** warung makan, kafe, resto (dine-in, takeaway, delivery)
- **Jasa:** salon, barbershop, laundry, bengkel (booking + komisi)
- **Grosir:** distributor kecil (harga bertingkat per kuantitas)

---

## 2. Sasaran & Metrik Keberhasilan

| Sasaran | Metrik | Target |
|---|---|---|
| Transaksi cepat | Waktu input 1 transaksi retail | < 30 detik |
| Reliabilitas | Transaksi tersimpan tanpa duplikat/hilang | 100% (ACID) |
| Fleksibilitas | Jenis usaha berjalan di 1 codebase | ≥ 4 tipe |
| Adopsi | Setup usaha baru sampai transaksi pertama | < 15 menit |
| Ringan | Bisa jalan di tablet/HP Android via browser | Ya (PWA) |

---

## 3. Ruang Lingkup Fitur

### 3.1 Fitur Inti (Must Have — MVP)
| ID | Fitur | Deskripsi | Tabel Terkait |
|---|---|---|---|
| F-01 | Autentikasi & multi-tenant | Register business, login email/password, login kasir via PIN | businesses, users |
| F-02 | Manajemen produk | CRUD item, kategori, satuan, varian, barcode | items, item_variants, categories, units |
| F-03 | Transaksi kasir | Keranjang → diskon → pajak → bayar → struk | transactions, transaction_items, payments |
| F-04 | Multi metode bayar | Tunai, QRIS, transfer; split payment dalam 1 transaksi | payment_channels, payments |
| F-05 | Struk | Cetak thermal (ESC/BisnisMu via browser) + kirim link struk WhatsApp | business_settings |
| F-06 | Stok dasar | Stok per outlet, berkurang otomatis saat jual, alert stok menipis | inventory, stock_movements |
| F-07 | Laporan dasar | Penjualan harian/bulanan, item terlaris, metode bayar | v_daily_sales, v_top_items |
| F-08 | Kas laci & shift | Buka/tutup laci, saldo awal-akhir, kas masuk/keluar | cash_drawer_sessions, cash_drawer_movements |

### 3.2 Fitur Penting (Should Have — Fase 2)
| ID | Fitur | Deskripsi |
|---|---|---|
| F-09 | Modifier & varian F&B | Topping, level pedas, catatan per item |
| F-10 | Meja & open bill | Dine-in: pesanan terbuka per meja, tambah item, bayar belakangan |
| F-11 | Pelanggan & kasbon | Data pelanggan, piutang/kasbon dengan batas kredit & cicilan |
| F-12 | Diskon & voucher | Promo otomatis terjadwal + voucher berkode unik |
| F-13 | Pengeluaran | Catat biaya operasional → laporan laba bersih |
| F-14 | Resep/BOM | Penjualan menu mengurangi stok bahan baku |

### 3.3 Fitur Lanjutan (Nice to Have — Fase 3+)
| ID | Fitur | Deskripsi |
|---|---|---|
| F-15 | Multi-outlet | Cabang, transfer stok antar outlet, harga per outlet |
| F-16 | Booking jasa | Janji temu, penugasan karyawan, kalender |
| F-17 | Komisi karyawan | Komisi per layanan, rekap per periode |
| F-18 | Loyalty | Poin per belanja, tukar poin, riwayat poin |
| F-19 | Purchase order & supplier | Restock terstruktur, utang supplier |
| F-20 | Stock opname | Hitung fisik vs sistem, penyesuaian otomatis |
| F-21 | Paket/bundle | Paket hemat berisi beberapa item |
| F-22 | Offline mode (PWA) | Transaksi tetap jalan saat internet putus, sync saat online |

### 3.4 Di Luar Lingkup (v1)
- Integrasi marketplace (Tokopedia/Shopee)
- Payment gateway otomatis (verifikasi QRIS manual dulu)
- Payroll lengkap (hanya komisi)
- Aplikasi native iOS/Android (cukup PWA)
- Akuntansi penuh (jurnal umum, neraca)

---

## 4. User Flow Utama

### 4.1 Flow Transaksi Penjualan (paling kritis)
```
Kasir login (PIN) → laci sudah open?
  └ belum → buka laci, input saldo awal
Pilih/scan item → varian & modifier (jika ada) → keranjang
  (opsional: pilih pelanggan, meja, tipe order)
Diskon/voucher → subtotal + pajak + pembulatan = TOTAL
Pilih metode bayar (bisa split) → input jumlah → kembalian
SIMPAN (1 DB transaction):
  1. Ambil nomor struk dari document_counters (atomik)
  2. Insert transactions + transaction_items + payments
  3. Kurangi stok (item / bahan resep / komponen bundle)
  4. Insert stock_movements
  5. Update poin & total_spent pelanggan (jika ada)
Cetak / kirim struk WA → transaksi berikutnya
```

### 4.2 Flow Open Bill (F&B dine-in)
```
Pilih meja → buat transaksi status 'open' → kirim pesanan (dapur)
Tamu nambah → tambah item ke transaksi yang sama
Tamu selesai → tampilkan bill → bayar → status 'completed' → meja 'available'
```

### 4.3 Flow Kasbon
```
Total transaksi → pelanggan terdaftar & enable_kasbon aktif?
→ pilih "Kasbon" sebagai metode bayar (cek credit_limit)
→ insert payments (is_receivable=TRUE) + customer_receivables
→ cicilan dicatat via receivable_payments hingga lunas
```

---

## 5. Arsitektur yang Direkomendasikan

### 5.1 Prinsip Arsitektur
1. **Modular monolith dulu, bukan microservices.** Untuk skala UMKM dan tim kecil (kamu + Claude Code), monolith dengan modul terpisah rapi jauh lebih cepat dibangun, dideploy, dan didebug. Pisah jadi service hanya jika benar-benar perlu nanti.
2. **API-first.** Backend murni REST API — frontend web, PWA, dan (kelak) mobile app memakai API yang sama.
3. **Feature flags per tenant.** Kolom `enable_*` di `business_settings` menentukan modul mana yang tampil. Satu deploy melayani semua jenis usaha.
4. **Transaksi penjualan = ACID.** Semua operasi penjualan dibungkus DB transaction; stok memakai locking untuk mencegah race condition.

### 5.2 Tech Stack
| Lapisan | Pilihan | Alasan |
|---|---|---|
| **Frontend** | Next.js 15 + TypeScript + Tailwind CSS | SSR untuk halaman laporan, CSR untuk layar kasir; PWA-ready; ekosistem paling matang |
| **State (kasir)** | Zustand + IndexedDB (Dexie) | Keranjang & katalog di-cache lokal → kasir tetap responsif, fondasi offline mode |
| **Backend** | NestJS (Node.js + TypeScript) | Arsitektur modular bawaan (module per domain), dependency injection, validasi DTO, cocok untuk monolith rapi |
| **ORM** | Prisma | Type-safe end-to-end dengan frontend TS; migrasi terkelola |
| **Database** | PostgreSQL 16 | Skema sudah dirancang untuk PG (JSONB, ENUM, partial index, RLS) |
| **Cache/Queue** | Redis (opsional fase 2) | Session, rate limit, antrian kirim struk WA |
| **Auth** | JWT (access + refresh) + PIN hash (argon2) | Sederhana, stateless, cocok multi-device kasir |
| **Realtime** | WebSocket (Socket.io) — fase 2 | Status meja & pesanan dapur realtime |
| **Deploy** | Docker Compose di VM Proxmox | Sesuai homelab kamu; Tailscale untuk akses aman multi-lokasi |
| **CI/CD** | GitHub Actions → build image → deploy | Otomasi sederhana |

### 5.3 Diagram Arsitektur (High Level)
```
┌─────────────────────────────────────────────────┐
│  CLIENT (browser/tablet/HP — PWA)               │
│  Next.js: Layar Kasir │ Dashboard Owner │ Admin │
│  IndexedDB (cache katalog, antrean offline)     │
└───────────────────────┬─────────────────────────┘
                        │ HTTPS (REST + WS)
┌───────────────────────▼─────────────────────────┐
│  BACKEND — NestJS (modular monolith)            │
│  ┌──────────┬──────────┬──────────┬──────────┐  │
│  │ Auth &   │ Catalog  │ Sales    │ Inventory│  │
│  │ Tenant   │ (items)  │ (txn)    │ (stock)  │  │
│  ├──────────┼──────────┼──────────┼──────────┤  │
│  │ Customer │ Payment  │ Report   │ Booking  │  │
│  │ & Kasbon │ Channel  │          │ & Komisi │  │
│  └──────────┴──────────┴──────────┴──────────┘  │
│  Cross-cutting: AuditLog · FeatureFlag · RBAC   │
└──────────┬───────────────────────┬──────────────┘
           │ Prisma                │
┌──────────▼──────────┐   ┌────────▼────────┐
│  PostgreSQL 16      │   │  Redis (fase 2) │
│  (skema v2)         │   │  queue struk WA │
└─────────────────────┘   └─────────────────┘

Deploy: Docker Compose @ VM Proxmox · akses via Tailscale/Cloudflare Tunnel
Backup: pg_dump harian → NAS/storage terpisah
```

### 5.4 Struktur Modul Backend (NestJS)
```
src/
├── modules/
│   ├── auth/            # login, JWT, PIN kasir, RBAC guard
│   ├── tenant/          # businesses, settings, feature flags, outlets
│   ├── catalog/         # items, variants, modifiers, categories, bundles, recipes
│   ├── inventory/       # stok, movements, transfer, opname
│   ├── sales/           # transaksi, open bill, void/refund  ← JANTUNG SISTEM
│   ├── payment/         # channels, payments, kasbon
│   ├── customer/        # pelanggan, loyalty, receivables
│   ├── promotion/       # discounts, vouchers, taxes
│   ├── cashdrawer/      # sesi laci, kas masuk/keluar, shift
│   ├── booking/         # janji temu (jasa)       [feature-flagged]
│   ├── commission/      # komisi karyawan          [feature-flagged]
│   ├── expense/         # pengeluaran operasional
│   └── report/          # laporan & dashboard
├── common/              # guards, interceptors, audit, pagination
└── prisma/              # schema & migrations
```

### 5.5 Keputusan Teknis Kritis
| Keputusan | Pilihan | Alasan |
|---|---|---|
| Konsistensi stok | `SELECT ... FOR UPDATE` pada baris inventory dalam DB transaction | Dua kasir jual barang terakhir bersamaan → hanya satu yang berhasil |
| Nomor struk | `UPDATE document_counters ... RETURNING` dalam transaksi yang sama | Atomik, reset harian per outlet, tanpa duplikat |
| Isolasi tenant | `business_id` di setiap query (middleware Prisma) + opsi RLS PostgreSQL | Data antar tenant tidak pernah bocor |
| Harga historis | Snapshot nama/harga/HPP di transaction_items | Laporan lama tidak berubah saat master data diedit |
| Uang | `NUMERIC(14,2)`, tidak pernah float | Presisi finansial |
| Cetak thermal | Web Bluetooth / WebUSB (ESC/BisnisMu) + fallback PDF | Tanpa aplikasi native |
| Struk WA | Link halaman struk publik (token) dikirim via `wa.me` | Gratis, tanpa API WhatsApp berbayar di v1 |

### 5.6 Keamanan
- Password: argon2id; PIN kasir: hashed + rate limit percobaan
- JWT access token pendek (15 mnt) + refresh token (httpOnly cookie)
- RBAC: role dasar + `user_permissions` granular (void, diskon manual, dsb)
- Semua aksi sensitif (void, ubah harga, hapus item) → `audit_logs`
- HTTPS wajib; akses admin dari luar via Tailscale
- Backup otomatis harian `pg_dump`, uji restore berkala

---

## 6. Roadmap Pengembangan — Bertahap dari Core

> Prinsip urutan: **jalur transaksi harus hidup dulu.** Semua fitur lain tidak berarti kalau kasir belum bisa mencatat penjualan dengan benar.

### FASE 0 — Fondasi (±1 minggu)
**Tujuan:** kerangka proyek siap dikembangkan.
1. Setup monorepo (frontend + backend) + Docker Compose (PostgreSQL, backend, frontend)
2. Terapkan skema database v2 via migrasi Prisma
3. Modul **auth**: register business, login, JWT, guard role
4. Modul **tenant**: business settings + feature flags, CRUD outlet
5. Seeder data contoh (1 business, 1 outlet, user owner + kasir)
6. CI dasar: lint + test + build

**Selesai jika:** bisa register usaha baru, login, dan feature flags terbaca di frontend.

### FASE 1 — CORE: Katalog + Mesin Transaksi (±2–3 minggu) ⭐ PALING PENTING
**Tujuan:** kasir bisa jualan dari awal sampai struk keluar.
1. Modul **catalog**: CRUD kategori, satuan, item, varian (retail sederhana dulu)
2. Modul **cashdrawer**: buka/tutup laci, saldo awal-akhir
3. Modul **sales** — jantung sistem:
   - Endpoint `BisnisMuT /transactions` dengan **satu DB transaction**: nomor struk atomik → insert transaksi & item (snapshot) → kurangi stok (`FOR UPDATE`) → catat stock_movements → payments
   - Void transaksi (dengan permission + audit log)
4. Modul **payment**: payment_channels (tunai + QRIS manual), split payment, kembalian
5. UI layar kasir: grid produk, pencarian/scan barcode, keranjang, pembayaran — dioptimalkan untuk tablet
6. Struk: tampilan cetak (PDF/print) + halaman struk publik untuk link WA
7. **Test paling kritis:** uji konkurensi — 2 request bersamaan beli stok terakhir → hanya 1 berhasil

**Selesai jika:** transaksi retail lengkap < 30 detik, stok berkurang benar, tidak ada nomor struk duplikat saat uji paralel.

### FASE 2 — Inventory & Laporan (±1–2 minggu)
**Tujuan:** owner mendapat nilai nyata (insight), stok terkendali.
1. Modul **inventory**: penyesuaian stok manual, riwayat movements, alert stok menipis
2. Modul **report**: dashboard omzet harian/bulanan, item terlaris, rekap metode bayar, rekap laci per shift (pakai view `v_daily_sales`, `v_top_items`, `v_low_stock`)
3. Modul **expense**: pengeluaran operasional → laporan laba kotor & bersih
4. Ekspor laporan (CSV/Excel)

**Selesai jika:** owner bisa jawab "hari ini untung berapa?" dari dashboard.

### FASE 3 — Fleksibilitas Jenis Usaha (±2–3 minggu)
**Tujuan:** benar-benar universal — F&B dan jasa bisa pakai.
1. **Modifier** (topping, level pedas) di katalog & layar kasir
2. **Meja & open bill**: layout meja, transaksi status `open`, tambah item, gabung bayar
3. **Item jasa** (`track_stock=false`) & harga `open` (input bebas)
4. **Harga tier** untuk grosir
5. **Pelanggan + kasbon**: CRUD pelanggan, bayar sebagian sebagai piutang, cicilan, laporan piutang
6. **Diskon & voucher**: promo otomatis terjadwal + redeem kode voucher

**Selesai jika:** 3 usaha simulasi (warung makan, toko kelontong, laundry) bisa beroperasi penuh hanya dengan mengubah feature flags.

### FASE 4 — Operasional Lanjutan (±2–3 minggu)
1. **Resep/BOM**: penjualan menu mengurangi stok bahan
2. **Bundle/paket**
3. **Multi-outlet**: transfer stok, harga per outlet, laporan per cabang
4. **Booking + komisi** untuk usaha jasa
5. **Loyalty**: poin, tukar poin, riwayat
6. **PO & supplier**, **stock opname**

### FASE 5 — Pematangan Produk (berkelanjutan)
1. **PWA offline mode**: antrean transaksi di IndexedDB, sync saat online (paling menantang secara teknis — kerjakan setelah semuanya stabil)
2. Realtime: status meja, layar dapur (KDS)
3. Cetak thermal langsung via Web Bluetooth
4. Notifikasi WA otomatis (struk, stok menipis) via API resmi
5. Hardening: RLS PostgreSQL, monitoring (Grafana di Proxmox), load test
6. Jika mau jadi SaaS: billing/subscription per tenant

---

## 7. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Race condition stok/nomor struk | Data korup, kepercayaan hilang | `FOR UPDATE` + document_counters + uji konkurensi sejak Fase 1 |
| Scope creep (fitur terlalu banyak) | Proyek tidak selesai | Disiplin fase; MVP = Fase 0–2 saja |
| Internet putus di lokasi usaha | Kasir berhenti jualan | Cache katalog lokal sejak awal; offline penuh di Fase 5 |
| Kebocoran data antar tenant | Fatal | Middleware business_id wajib di semua query + test isolasi |
| Homelab down (single point) | Semua toko berhenti | Backup harian + rencana migrasi ke VPS saat ada pengguna nyata |

---

## 8. Ukuran Keberhasilan MVP
MVP dinyatakan berhasil jika satu usaha nyata (misal warung kenalan) memakai aplikasi ini selama 2 minggu penuh dengan: ≥ 95% transaksi tercatat via aplikasi (bukan manual), nol kejadian selisih stok akibat bug, dan owner membuka laporan minimal 3× per minggu.
