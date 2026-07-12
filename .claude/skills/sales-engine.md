---
name: sales-engine
description: Aturan transaksi penjualan — jantung sistem
---

# Mesin Transaksi Penjualan BisnisMu

## Flow Wajib (dalam satu prisma.$transaction)
1. Nomor struk atomik: UPDATE document_counters SET last_number = last_number + 1
2. Insert transactions + transaction_items (dengan SNAPSHOT)
3. Kurangi stok dengan SELECT ... FOR UPDATE:
   - track_stock=true, use_recipe=false → kurangi inventory item
   - use_recipe=true → kurangi bahan di recipes
   - track_stock=false (jasa) → skip
4. Insert stock_movements
5. Insert payments
6. Update customer (total_spent, visit_count, poin)

## Test Wajib
- Konkurensi: 2 request paralel beli stok terakhir → hanya 1 sukses
- Nomor struk: 20 request paralel → 20 nomor unik berurutan
- Rollback: jika error, stok tidak berubah
