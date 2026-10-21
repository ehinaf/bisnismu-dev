import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, rounding_mode } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { dateOnly, nextDate, resolveTimeZone, zonedDayStart, zonedParts } from "../../common/utils/business-time";
import { AUDIT_ACTIONS, writeAuditLog, type AuditActor } from "../../common/audit/audit-log";
import { COUNTED_STATUSES } from "../../common/utils/transaction-status";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { CreateTransactionItemDto } from "./dto/create-transaction-item.dto";
import { CreateTransactionPaymentDto } from "./dto/create-transaction-payment.dto";
import { OpenBillDto } from "./dto/open-bill.dto";
import { AddBillItemsDto } from "./dto/add-bill-items.dto";
import { CloseBillDto } from "./dto/close-bill.dto";
import { QuoteTransactionDto } from "./dto/quote-transaction.dto";
import { QuoteBillDto } from "./dto/quote-bill.dto";
import { applyRounding, roundMoney } from "./sales.pricing";
import {
  allocateRefund,
  computeRefund,
  type RefundableLine,
  type RefundableTransaction,
  type RefundComputation,
  type RefundSelection,
} from "./sales.refund";
import { RefundQuoteDto, RefundTransactionDto } from "./dto/refund-transaction.dto";

// Relasi yang dikembalikan setiap endpoint transaksi (create/open/addItems/close/getOne).
const TRANSACTION_INCLUDE = {
  items: { include: { modifiers: true } },
  payments: true,
  taxes: true,
  // Struk refund menaut ke penjualan asli; struk asli menampilkan daftar refund-nya.
  reference_transaction: { select: { id: true, transaction_number: true } },
  refund_transactions: {
    where: { transaction_type: "refund" },
    select: { id: true, transaction_number: true, total: true, created_at: true },
    orderBy: { created_at: "asc" },
  },
} satisfies Prisma.TransactionInclude;

type TransactionWithRelations = Prisma.TransactionGetPayload<{ include: typeof TRANSACTION_INCLUDE }>;

// Tipe minimal untuk baris hasil raw query SELECT ... FOR UPDATE.
interface InventoryLockRow {
  id: string;
  quantity_on_hand: Prisma.Decimal | string;
}

interface ResolvedModifier {
  modifier_id: string;
  name: string;
  price_adjustment: Prisma.Decimal;
  ingredient_item_id: string | null;
  ingredient_qty: Prisma.Decimal | null;
}

interface ResolvedItem {
  item_id: string;
  variant_id: string | null;
  category_id: string | null;
  item_type: string;
  track_stock: boolean;
  use_recipe: boolean;
  item_name_snapshot: string;
  variant_name_snapshot: string | null;
  quantity: Prisma.Decimal;
  unit_price: Prisma.Decimal;
  unit_cost_snapshot: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  served_by: string | null;
  notes: string | null;
  modifiers: ResolvedModifier[];
}

interface TaxRow {
  tax_id: string;
  tax_name_snapshot: string;
  rate_snapshot: Prisma.Decimal;
  amount: Prisma.Decimal;
}

// Bentuk minimal baris yang dibutuhkan resolveAutoDiscounts untuk mengevaluasi
// scope='category'/'specific_items' — dipenuhi baik oleh ResolvedItem (baru
// dihitung) maupun transaction_items yang sudah tersimpan (dipakai closeBill).
interface DiscountEligibleLine {
  item_id: string;
  category_id: string | null;
  subtotal: Prisma.Decimal;
}

interface DiscountRow {
  discount_id: string;
  discount_name_snapshot: string;
  amount_applied: Prisma.Decimal;
}

interface VoucherResult {
  voucher_id: string;
  code: string;
  amount: Prisma.Decimal;
}

// Hasil perhitungan harga di titik checkout (createTransaction, closeBill, quote).
interface CheckoutPricing {
  discountRows: DiscountRow[];
  voucher: VoucherResult | null;
  discountTotal: Prisma.Decimal;
  taxRows: TaxRow[];
  taxTotal: Prisma.Decimal;
  serviceChargeTotal: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
  total: Prisma.Decimal;
  rounding_adjustment: Prisma.Decimal;
}

export interface CheckoutQuote {
  subtotal: Prisma.Decimal;
  discount_total: Prisma.Decimal;
  discounts: Array<{ name: string; amount: Prisma.Decimal }>;
  voucher: { code: string; amount: Prisma.Decimal } | null;
  tax_total: Prisma.Decimal;
  service_charge_total: Prisma.Decimal;
  delivery_fee: Prisma.Decimal;
  rounding_adjustment: Prisma.Decimal;
  total: Prisma.Decimal;
}

// Satu pengurangan stok: item biasa, komponen bundle, bahan resep, atau bahan modifier.
interface StockDeduction {
  item_id: string;
  variant_id: string | null;
  quantity: Prisma.Decimal;
  movement_type: "sale_out" | "recipe_out";
  item_name: string;
}

type StockKey = Pick<StockDeduction, "item_id" | "variant_id">;

function compareStockKey(a: StockKey, b: StockKey): number {
  const keyA = `${a.item_id}:${a.variant_id ?? ""}`;
  const keyB = `${b.item_id}:${b.variant_id ?? ""}`;
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async createTransaction(businessId: string, cashierId: string, dto: CreateTransactionDto) {
    return this.withIdempotency(businessId, dto.outlet_id, dto.client_ref, () =>
      this.prisma.$transaction(
        async (tx) => {
          // ── 1. Validasi konteks (outlet, customer, meja) — semua WAJIB milik business_id ini ──
          const outlet = await tx.outlet.findFirst({
            where: { id: dto.outlet_id, business_id: businessId, deleted_at: null },
          });
          if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");

          // Sesi laci terbuka di outlet ini ditautkan otomatis jika ada — TIDAK wajib,
          // supaya modul cashdrawer tetap independen (belum buka laci ≠ tidak bisa jual).
          const cashDrawerSessionId = await this.lockOpenDrawerSession(tx, dto.outlet_id);

          const customer = dto.customer_id
            ? await tx.customer.findFirst({
                where: { id: dto.customer_id, business_id: businessId, deleted_at: null },
              })
            : null;
          if (dto.customer_id && !customer) throw new NotFoundException("Pelanggan tidak ditemukan");

          if (dto.dining_table_id) {
            const table = await tx.diningTable.findFirst({
              where: { id: dto.dining_table_id, outlet_id: dto.outlet_id },
            });
            if (!table) throw new NotFoundException("Meja tidak ditemukan");
          }

          const settings = await tx.businessSetting.findFirst({ where: { business_id: businessId } });
          const timeZone = await this.businessTimeZone(tx, businessId);

          // ── 2. Resolusi harga tiap baris item ──
          const { resolvedItems, subtotal, totalCost } = await this.resolveLineItems(
            tx,
            businessId,
            dto.outlet_id,
            dto.items,
          );

          // ── 3–5. Diskon otomatis + voucher (baris voucher dikunci), pajak & service
          // charge atas subtotal SETELAH diskon, ongkir, lalu pembulatan ──
          const pricing = await this.priceCheckout(tx, businessId, {
            subtotal,
            lines: resolvedItems,
            voucherCode: dto.voucher_code,
            customerId: customer?.id ?? null,
            deliveryFee: dto.delivery_fee,
            rounding: settings?.rounding ?? "none",
            timeZone,
            lockVoucher: true,
          });

          // ── 6. Nomor struk atomik (document_counters) ──
          const transactionNumber = await this.nextTransactionNumber(tx, businessId, dto.outlet_id, timeZone);

          // ── 7. Insert transactions (amount_paid/change_due diisi finalizePayment di bawah) ──
          const transaction = await tx.transaction.create({
            data: {
              business_id: businessId,
              outlet_id: dto.outlet_id,
              cashier_id: cashierId,
              customer_id: customer?.id,
              dining_table_id: dto.dining_table_id,
              cash_drawer_session_id: cashDrawerSessionId,
              transaction_number: transactionNumber,
              client_ref: dto.client_ref,
              order_type: dto.order_type ?? "retail",
              status: "completed",
              guest_count: dto.guest_count,
              subtotal,
              discount_total: pricing.discountTotal,
              tax_total: pricing.taxTotal,
              service_charge_total: pricing.serviceChargeTotal,
              rounding_adjustment: pricing.rounding_adjustment,
              total: pricing.total,
              total_cost: totalCost,
              delivery_address: dto.delivery_address,
              delivery_fee: pricing.deliveryFee,
              notes: dto.notes,
              completed_at: new Date(),
            },
          });

          // ── 8. Insert transaction_items (snapshot) ──
          await this.insertTransactionItems(tx, transaction.id, resolvedItems);

          // ── 9. Insert transaction_taxes & transaction_discounts (snapshot) ──
          await this.insertTransactionTaxes(tx, transaction.id, pricing.taxRows);
          await this.insertTransactionDiscounts(tx, transaction.id, pricing.discountRows);
          if (pricing.voucher) {
            await this.applyVoucherRedemption(
              tx,
              transaction.id,
              customer?.id ?? null,
              pricing.voucher.voucher_id,
              pricing.voucher.amount,
            );
          }

          // ── 10. Kurangi stok (SELECT ... FOR UPDATE, urutan kunci deterministik) ──
          await this.reduceStockForItems(tx, dto.outlet_id, resolvedItems, transaction.id, cashierId);

          // ── 11. Pembayaran, kasbon, poin loyalty ──
          await this.finalizePayment(tx, businessId, { id: transaction.id, total: pricing.total }, dto.payments, customer, settings);

          // ── 12. Kembalikan transaksi lengkap ──
          return tx.transaction.findUniqueOrThrow({
            where: { id: transaction.id },
            include: TRANSACTION_INCLUDE,
          });
        },
        { maxWait: 10_000, timeout: 20_000 },
      ),
    );
  }

  async getTransactionById(businessId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, business_id: businessId },
      include: TRANSACTION_INCLUDE,
    });
    if (!transaction) throw new NotFoundException("Transaksi tidak ditemukan");
    return transaction;
  }

  // =====================================================================
  // QUOTE — pratinjau harga tanpa menyimpan apa pun. Memakai priceCheckout
  // yang sama dengan createTransaction/closeBill, jadi total yang dilihat
  // kasir = total yang akan disimpan (selama data master tidak berubah di
  // antaranya — angka final tetap dihitung ulang dengan kunci saat simpan).
  // =====================================================================

  async quoteTransaction(businessId: string, dto: QuoteTransactionDto): Promise<CheckoutQuote> {
    const db = this.prisma;
    const outlet = await db.outlet.findFirst({
      where: { id: dto.outlet_id, business_id: businessId, deleted_at: null },
    });
    if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");

    if (dto.customer_id) {
      const customer = await db.customer.findFirst({
        where: { id: dto.customer_id, business_id: businessId, deleted_at: null },
      });
      if (!customer) throw new NotFoundException("Pelanggan tidak ditemukan");
    }

    const settings = await db.businessSetting.findFirst({ where: { business_id: businessId } });
    const timeZone = await this.businessTimeZone(db, businessId);
    const { resolvedItems, subtotal } = await this.resolveLineItems(db, businessId, dto.outlet_id, dto.items);

    const pricing = await this.priceCheckout(db, businessId, {
      subtotal,
      lines: resolvedItems,
      voucherCode: dto.voucher_code,
      customerId: dto.customer_id ?? null,
      deliveryFee: dto.delivery_fee,
      rounding: settings?.rounding ?? "none",
      timeZone,
      lockVoucher: false,
    });
    return this.toQuote(subtotal, pricing);
  }

  async quoteBill(businessId: string, transactionId: string, dto: QuoteBillDto): Promise<CheckoutQuote> {
    const db = this.prisma;
    const bill = await db.transaction.findFirst({ where: { id: transactionId, business_id: businessId } });
    if (!bill) throw new NotFoundException("Transaksi tidak ditemukan");
    if (bill.status !== "open") throw new BadRequestException("Bill ini sudah ditutup atau bukan open bill");

    const settings = await db.businessSetting.findFirst({ where: { business_id: businessId } });
    const timeZone = await this.businessTimeZone(db, businessId);
    const subtotal = new Prisma.Decimal(bill.subtotal);

    const pricing = await this.priceCheckout(db, businessId, {
      subtotal,
      lines: await this.billDiscountLines(db, bill.id),
      voucherCode: dto.voucher_code,
      customerId: bill.customer_id,
      deliveryFee: bill.delivery_fee,
      rounding: settings?.rounding ?? "none",
      timeZone,
      lockVoucher: false,
    });
    return this.toQuote(subtotal, pricing);
  }

  // =====================================================================
  // OPEN BILL — dine-in / hold order (PRD §4.2)
  // Berbeda dari createTransaction: transaksi dibuat status='open' TANPA
  // pembayaran, item bisa ditambah belakangan (addBillItems), baru
  // pembayaran diproses saat closeBill.
  // =====================================================================

  async openBill(businessId: string, cashierId: string, dto: OpenBillDto) {
    return this.withIdempotency(businessId, dto.outlet_id, dto.client_ref, () =>
      this.prisma.$transaction(
        async (tx) => {
          const outlet = await tx.outlet.findFirst({
            where: { id: dto.outlet_id, business_id: businessId, deleted_at: null },
          });
          if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");

          const customer = dto.customer_id
            ? await tx.customer.findFirst({ where: { id: dto.customer_id, business_id: businessId, deleted_at: null } })
            : null;
          if (dto.customer_id && !customer) throw new NotFoundException("Pelanggan tidak ditemukan");

          let tableId: string | null = null;
          if (dto.dining_table_id) {
            // Kunci baris meja supaya dua kasir tidak bisa buka bill di meja yang
            // sama secara bersamaan (race condition serupa penguncian inventory).
            const tableRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
              SELECT id, status FROM dining_tables
              WHERE id = ${dto.dining_table_id} AND outlet_id = ${dto.outlet_id}
              FOR UPDATE
            `;
            const table = tableRows[0];
            if (!table) throw new NotFoundException("Meja tidak ditemukan");
            if (table.status === "occupied") {
              throw new ConflictException("Meja ini sudah dipakai bill lain yang masih terbuka");
            }
            tableId = table.id;
          }

          const openCashDrawerSession = await tx.cashDrawerSession.findFirst({
            where: { outlet_id: dto.outlet_id, status: "open" },
          });

          const items = dto.items ?? [];
          const { resolvedItems, subtotal, totalCost } =
            items.length > 0
              ? await this.resolveLineItems(tx, businessId, dto.outlet_id, items)
              : { resolvedItems: [] as ResolvedItem[], subtotal: new Prisma.Decimal(0), totalCost: new Prisma.Decimal(0) };

          const settings = await tx.businessSetting.findFirst({ where: { business_id: businessId } });
          const timeZone = await this.businessTimeZone(tx, businessId);
          const { taxTotal, serviceChargeTotal, taxRows } = await this.computeTaxes(tx, businessId, subtotal);
          const rawTotal = subtotal.plus(taxTotal).plus(serviceChargeTotal);
          const { total, rounding_adjustment } = applyRounding(rawTotal, settings?.rounding ?? "none");

          const transactionNumber = await this.nextTransactionNumber(tx, businessId, dto.outlet_id, timeZone);

          const transaction = await tx.transaction.create({
            data: {
              business_id: businessId,
              outlet_id: dto.outlet_id,
              cashier_id: cashierId,
              customer_id: customer?.id,
              dining_table_id: tableId,
              cash_drawer_session_id: openCashDrawerSession?.id,
              transaction_number: transactionNumber,
              client_ref: dto.client_ref,
              order_type: dto.order_type ?? (tableId ? "dine_in" : "retail"),
              status: "open",
              guest_count: dto.guest_count,
              subtotal,
              tax_total: taxTotal,
              service_charge_total: serviceChargeTotal,
              rounding_adjustment,
              total,
              total_cost: totalCost,
              notes: dto.notes,
            },
          });

          await this.insertTransactionItems(tx, transaction.id, resolvedItems);
          await this.insertTransactionTaxes(tx, transaction.id, taxRows);
          await this.reduceStockForItems(tx, dto.outlet_id, resolvedItems, transaction.id, cashierId);

          if (tableId) {
            await tx.diningTable.update({ where: { id: tableId }, data: { status: "occupied" } });
          }

          return tx.transaction.findUniqueOrThrow({
            where: { id: transaction.id },
            include: TRANSACTION_INCLUDE,
          });
        },
        { maxWait: 10_000, timeout: 20_000 },
      ),
    );
  }

  async addBillItems(businessId: string, userId: string, transactionId: string, dto: AddBillItemsDto) {
    return this.prisma.$transaction(
      async (tx) => {
        // Kunci baris transaksi dulu — kalau dua pelayan nambah pesanan ke bill
        // yang sama nyaris bersamaan, yang kedua menunggu commit yang pertama
        // supaya subtotal/total selalu terhitung dari state paling akhir.
        const lockedRows = await tx.$queryRaw<
          Array<{
            id: string;
            status: string;
            outlet_id: string;
            subtotal: Prisma.Decimal | string;
            total_cost: Prisma.Decimal | string;
          }>
        >`
          SELECT id, status, outlet_id, subtotal, total_cost FROM transactions
          WHERE id = ${transactionId} AND business_id = ${businessId}
          FOR UPDATE
        `;
        const locked = lockedRows[0];
        if (!locked) throw new NotFoundException("Transaksi tidak ditemukan");
        if (locked.status !== "open") throw new BadRequestException("Bill ini sudah tidak terbuka");

        const { resolvedItems, subtotal: addedSubtotal, totalCost: addedCost } = await this.resolveLineItems(
          tx,
          businessId,
          locked.outlet_id,
          dto.items,
        );

        await this.insertTransactionItems(tx, transactionId, resolvedItems);
        await this.reduceStockForItems(tx, locked.outlet_id, resolvedItems, transactionId, userId);

        const cumulativeSubtotal = new Prisma.Decimal(locked.subtotal).plus(addedSubtotal);
        const cumulativeCost = new Prisma.Decimal(locked.total_cost).plus(addedCost);

        // Pajak dihitung ulang dari nol atas subtotal kumulatif (bukan
        // ditambah-tambah) supaya tidak pernah drift dari basis yang benar.
        await tx.transactionTax.deleteMany({ where: { transaction_id: transactionId } });
        const { taxTotal, serviceChargeTotal, taxRows } = await this.computeTaxes(tx, businessId, cumulativeSubtotal);
        await this.insertTransactionTaxes(tx, transactionId, taxRows);

        const settings = await tx.businessSetting.findFirst({ where: { business_id: businessId } });
        const rawTotal = cumulativeSubtotal.plus(taxTotal).plus(serviceChargeTotal);
        const { total, rounding_adjustment } = applyRounding(rawTotal, settings?.rounding ?? "none");

        return tx.transaction.update({
          where: { id: transactionId },
          data: {
            subtotal: cumulativeSubtotal,
            tax_total: taxTotal,
            service_charge_total: serviceChargeTotal,
            rounding_adjustment,
            total,
            total_cost: cumulativeCost,
          },
          include: TRANSACTION_INCLUDE,
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  async closeBill(businessId: string, userId: string, transactionId: string, dto: CloseBillDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const lockedRows = await tx.$queryRaw<
          Array<{
            id: string;
            status: string;
            outlet_id: string;
            subtotal: Prisma.Decimal | string;
            delivery_fee: Prisma.Decimal | string;
            customer_id: string | null;
            dining_table_id: string | null;
          }>
        >`
          SELECT id, status, outlet_id, subtotal, delivery_fee, customer_id, dining_table_id FROM transactions
          WHERE id = ${transactionId} AND business_id = ${businessId}
          FOR UPDATE
        `;
        const locked = lockedRows[0];
        if (!locked) throw new NotFoundException("Transaksi tidak ditemukan");
        if (locked.status !== "open") throw new BadRequestException("Bill ini sudah ditutup atau bukan open bill");

        const customer = locked.customer_id
          ? await tx.customer.findFirst({ where: { id: locked.customer_id, business_id: businessId } })
          : null;
        const settings = await tx.businessSetting.findFirst({ where: { business_id: businessId } });
        const timeZone = await this.businessTimeZone(tx, businessId);

        // Uang diterima SAAT bill ditutup — tautkan ke laci yang terbuka sekarang
        // (bisa beda shift dari saat bill dibuka), supaya saldo laci yang
        // diharapkan saat tutup shift cocok dengan uang fisik di laci.
        const cashDrawerSessionId = await this.lockOpenDrawerSession(tx, locked.outlet_id);

        // ── Diskon otomatis + voucher (opsional) dievaluasi di titik checkout ini,
        // atas seluruh item yang sudah terkumpul di bill sampai saat ditutup. ──
        const subtotal = new Prisma.Decimal(locked.subtotal);
        const pricing = await this.priceCheckout(tx, businessId, {
          subtotal,
          lines: await this.billDiscountLines(tx, transactionId),
          voucherCode: dto.voucher_code,
          customerId: locked.customer_id,
          deliveryFee: locked.delivery_fee,
          rounding: settings?.rounding ?? "none",
          timeZone,
          lockVoucher: true,
        });

        await tx.transactionTax.deleteMany({ where: { transaction_id: transactionId } });
        await this.insertTransactionTaxes(tx, transactionId, pricing.taxRows);
        await this.insertTransactionDiscounts(tx, transactionId, pricing.discountRows);
        if (pricing.voucher) {
          await this.applyVoucherRedemption(
            tx,
            transactionId,
            locked.customer_id,
            pricing.voucher.voucher_id,
            pricing.voucher.amount,
          );
        }

        await tx.transaction.update({
          where: { id: transactionId },
          data: {
            discount_total: pricing.discountTotal,
            tax_total: pricing.taxTotal,
            service_charge_total: pricing.serviceChargeTotal,
            rounding_adjustment: pricing.rounding_adjustment,
            total: pricing.total,
            cash_drawer_session_id: cashDrawerSessionId,
          },
        });

        await this.finalizePayment(tx, businessId, { id: transactionId, total: pricing.total }, dto.payments, customer, settings, {
          status: "completed",
          completed_at: new Date(),
        });

        if (locked.dining_table_id) {
          await tx.diningTable.update({ where: { id: locked.dining_table_id }, data: { status: "available" } });
        }

        return tx.transaction.findUniqueOrThrow({
          where: { id: transactionId },
          include: TRANSACTION_INCLUDE,
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  listOpenBills(businessId: string, outletId: string) {
    return this.prisma.transaction.findMany({
      where: { business_id: businessId, outlet_id: outletId, status: "open" },
      include: { items: true, dining_table: true },
      orderBy: { created_at: "asc" },
    });
  }

  /** Riwayat penjualan & refund satu hari kalender usaha (default: hari ini), terbaru dulu. */
  async listTransactions(businessId: string, outletId: string, date?: string) {
    const outlet = await this.prisma.outlet.findFirst({ where: { id: outletId, business_id: businessId, deleted_at: null } });
    if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");

    const timeZone = await this.businessTimeZone(this.prisma, businessId);
    const day = date ?? zonedParts(new Date(), timeZone).date;
    return this.prisma.transaction.findMany({
      where: {
        business_id: businessId,
        outlet_id: outletId,
        status: { not: "open" },
        created_at: { gte: zonedDayStart(day, timeZone), lt: zonedDayStart(nextDate(day), timeZone) },
      },
      select: {
        id: true,
        transaction_number: true,
        transaction_type: true,
        status: true,
        total: true,
        reference_transaction: { select: { transaction_number: true } },
        created_at: true,
        void_reason: true,
        customer: { select: { name: true } },
        payments: { select: { channel_name_snapshot: true, amount: true, is_receivable: true } },
      },
      orderBy: { created_at: "desc" },
      take: 200,
    });
  }

  // =====================================================================
  // VOID — batalkan penjualan selesai (selama shift lacinya masih buka) atau
  // open bill. Semua efek penjualan dibalik dalam satu transaksi DB: stok,
  // voucher, kasbon, statistik & poin pelanggan, meja. Saldo laci dan laporan
  // cukup mengabaikan status 'void' (keduanya hanya menghitung 'completed').
  // =====================================================================

  async voidTransaction(businessId: string, transactionId: string, reason: string, actor: AuditActor) {
    return this.prisma.$transaction(
      async (tx) => {
        // Kunci baris transaksi: void ganda paralel, atau void yang balapan dengan
        // closeBill/addBillItems, antre di sini dan melihat status terbaru.
        const lockedRows = await tx.$queryRaw<
          Array<{
            id: string;
            status: string;
            transaction_type: string;
            transaction_number: string;
            cash_drawer_session_id: string | null;
            customer_id: string | null;
            dining_table_id: string | null;
            total: Prisma.Decimal | string;
          }>
        >`
          SELECT id, status, transaction_type, transaction_number, cash_drawer_session_id,
                 customer_id, dining_table_id, total
          FROM transactions
          WHERE id = ${transactionId} AND business_id = ${businessId}
          FOR UPDATE
        `;
        const locked = lockedRows[0];
        if (!locked) throw new NotFoundException("Transaksi tidak ditemukan");
        if (locked.transaction_type !== "sale") throw new BadRequestException("Hanya transaksi penjualan yang bisa dibatalkan");
        if (locked.status !== "completed" && locked.status !== "open") {
          throw new BadRequestException("Transaksi ini sudah dibatalkan atau di-refund");
        }
        const wasOpenBill = locked.status === "open";
        const total = new Prisma.Decimal(locked.total);

        // Void hanya selama uangnya masih di laci shift yang sama — saldo akhir shift
        // yang sudah ditutup tidak boleh berubah diam-diam (transaksi shift lalu → refund).
        // FOR SHARE: tutup laci paralel (FOR NO KEY UPDATE) menunggu void ini selesai.
        if (!wasOpenBill && locked.cash_drawer_session_id) {
          const sessions = await tx.$queryRaw<Array<{ status: string }>>`
            SELECT status FROM cash_drawer_sessions WHERE id = ${locked.cash_drawer_session_id} FOR SHARE
          `;
          if (sessions[0]?.status !== "open") {
            throw new ConflictException("Shift laci transaksi ini sudah ditutup — gunakan refund");
          }
        }

        // Kasbon yang sudah dicicil tidak bisa dihapus begitu saja (uang cicilan sudah masuk).
        const receivables = await tx.$queryRaw<Array<{ id: string; amount_paid: Prisma.Decimal | string }>>`
          SELECT id, amount_paid FROM customer_receivables WHERE transaction_id = ${transactionId} FOR UPDATE
        `;
        if (receivables.some((r) => new Prisma.Decimal(r.amount_paid).greaterThan(0))) {
          throw new ConflictException("Kasbon transaksi ini sudah dicicil — tidak bisa dibatalkan");
        }
        if (receivables.length > 0) {
          await tx.customerReceivable.updateMany({
            where: { id: { in: receivables.map((r) => r.id) } },
            data: { status: "written_off", notes: `Dibatalkan: void ${locked.transaction_number}` },
          });
        }

        await this.restoreStockForTransaction(tx, transactionId, locked.transaction_number, actor.userId);

        // Baris redemption disimpan sebagai riwayat; resolveVoucher tidak menghitung
        // redemption milik transaksi void untuk batas per pelanggan.
        const redemptions = await tx.voucherRedemption.findMany({
          where: { transaction_id: transactionId },
          select: { voucher_id: true },
        });
        for (const r of redemptions) {
          await tx.voucher.update({ where: { id: r.voucher_id }, data: { usage_count: { decrement: 1 } } });
        }

        // Statistik & poin pelanggan hanya bertambah saat pembayaran (finalizePayment).
        if (!wasOpenBill && locked.customer_id) {
          await tx.customer.update({
            where: { id: locked.customer_id },
            data: { total_spent: { decrement: total }, visit_count: { decrement: 1 } },
          });
          const earned = await tx.loyaltyPointEntry.aggregate({
            where: { transaction_id: transactionId, entry_type: "earn" },
            _sum: { points: true },
          });
          const points = earned._sum.points ?? 0;
          if (points > 0) {
            await tx.customer.update({ where: { id: locked.customer_id }, data: { loyalty_points: { decrement: points } } });
            await tx.loyaltyPointEntry.create({
              data: {
                customer_id: locked.customer_id,
                entry_type: "adjustment",
                points: -points,
                transaction_id: transactionId,
                notes: `Void ${locked.transaction_number}`,
              },
            });
          }
        }

        if (wasOpenBill && locked.dining_table_id) {
          await tx.diningTable.update({ where: { id: locked.dining_table_id }, data: { status: "available" } });
        }

        await tx.transaction.update({
          where: { id: transactionId },
          data: { status: "void", void_reason: reason, voided_by: actor.userId },
        });

        await writeAuditLog(tx, {
          businessId,
          userId: actor.userId,
          action: wasOpenBill ? AUDIT_ACTIONS.CANCEL_OPEN_BILL : AUDIT_ACTIONS.VOID_TRANSACTION,
          entityType: "transaction",
          entityId: transactionId,
          oldValue: { status: locked.status, total: total.toString(), transaction_number: locked.transaction_number },
          newValue: { status: "void", reason },
          ip: actor.ip,
        });

        return tx.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: TRANSACTION_INCLUDE });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  // =====================================================================
  // REFUND — retur sebagian/penuh, juga untuk transaksi dari shift yang sudah
  // ditutup. Refund = transaksi baru transaction_type='refund' bernilai
  // NEGATIF yang menunjuk penjualan asli, dicatat di laci shift yang SEDANG
  // buka — laci & laporan (COUNTED_STATUSES) jadi bersih tanpa logika khusus.
  // =====================================================================

  /** Baris yang masih bisa di-refund (sisa qty) + apakah barangnya bisa kembali ke stok — untuk dialog refund. */
  async refundableLines(businessId: string, transactionId: string) {
    const { original, lines } = await this.loadRefundable(this.prisma, businessId, transactionId);
    return original.items.map((item) => {
      const line = lines.find((l) => l.id === item.id)!;
      return {
        transaction_item_id: item.id,
        item_name: item.variant_name_snapshot
          ? `${item.item_name_snapshot} (${item.variant_name_snapshot})`
          : item.item_name_snapshot,
        quantity: line.quantity,
        refunded_quantity: line.refundedQuantity,
        remaining_quantity: line.quantity.minus(line.refundedQuantity),
        unit_price: item.unit_price,
        restockable: this.isRestockable(item),
      };
    });
  }

  /** Pratinjau refund (hanya membaca) — angka yang sama dengan refundTransaction. */
  async quoteRefund(businessId: string, transactionId: string, dto: RefundQuoteDto) {
    const refundable = await this.loadRefundable(this.prisma, businessId, transactionId);
    const computation = computeRefund(refundable.transaction, refundable.lines, this.toSelection(dto.lines));
    const allocation = allocateRefund(computation.amount, await this.unpaidReceivable(this.prisma, transactionId));
    return {
      amount: computation.amount,
      receivable_reduction: allocation.receivableReduction,
      paid_out: allocation.paidOut,
      is_final: computation.isFinal,
      lines: computation.lines.map((l) => ({ transaction_item_id: l.lineId, quantity: l.quantity, value: l.value })),
    };
  }

  async refundTransaction(businessId: string, transactionId: string, dto: RefundTransactionDto, actor: AuditActor) {
    const head = await this.prisma.transaction.findFirst({
      where: { id: transactionId, business_id: businessId },
      select: { outlet_id: true },
    });
    if (!head) throw new NotFoundException("Transaksi tidak ditemukan");

    return this.withIdempotency(businessId, head.outlet_id, dto.client_ref, () =>
      this.prisma.$transaction(
        async (tx) => {
          // Kunci penjualan asli: refund paralel antre dan menghitung sisa item
          // dari keadaan terbaru (tidak bisa me-refund unit yang sama dua kali).
          await tx.$queryRaw`
            SELECT id FROM transactions WHERE id = ${transactionId} AND business_id = ${businessId} FOR UPDATE
          `;
          // Retry dengan client_ref yang sama bisa menunggu di kunci di atas sementara
          // percobaan pertama commit — cek ulang di sini, sebelum validasi sisa item
          // (yang akan menolak karena unitnya sudah di-refund oleh percobaan pertama).
          if (dto.client_ref) {
            const existing = await tx.transaction.findUnique({
              where: { business_id_client_ref: { business_id: businessId, client_ref: dto.client_ref } },
              include: TRANSACTION_INCLUDE,
            });
            if (existing) return existing;
          }
          const { original, transaction, lines } = await this.loadRefundable(tx, businessId, transactionId);
          const selection = this.toSelection(dto.lines);
          const computation = computeRefund(transaction, lines, selection);

          const receivables = await tx.$queryRaw<
            Array<{ id: string; amount: Prisma.Decimal | string; amount_paid: Prisma.Decimal | string; status: string }>
          >`
            SELECT id, amount, amount_paid, status FROM customer_receivables
            WHERE transaction_id = ${transactionId} FOR UPDATE
          `;
          const openReceivable = receivables.find((r) => r.status === "outstanding" || r.status === "partially_paid");
          const unpaid = openReceivable
            ? new Prisma.Decimal(openReceivable.amount).minus(new Prisma.Decimal(openReceivable.amount_paid))
            : new Prisma.Decimal(0);
          const allocation = allocateRefund(computation.amount, unpaid);

          // Uang keluar lewat kanal pilihan kasir; tunai wajib dari laci yang sedang buka.
          let channel: { id: string; name: string; channel_type: string } | null = null;
          if (allocation.paidOut.greaterThan(0)) {
            channel = await tx.paymentChannel.findFirst({
              where: { id: dto.payment_channel_id, business_id: businessId, is_active: true },
              select: { id: true, name: true, channel_type: true },
            });
            if (!channel) throw new NotFoundException("Metode refund tidak ditemukan");
          }
          const cashDrawerSessionId = await this.lockOpenDrawerSession(tx, original.outlet_id);
          if (channel?.channel_type === "cash" && !cashDrawerSessionId) {
            throw new ConflictException("Buka shift laci dulu untuk refund tunai");
          }

          const timeZone = await this.businessTimeZone(tx, businessId);
          const refundNumber = await this.nextTransactionNumber(tx, businessId, original.outlet_id, timeZone, "refund");

          // Barang fisik kembali ke stok (default); menu resep & paket tidak — bahannya sudah terpakai.
          const restockLines = computation.lines.filter((l) => {
            const line = original.items.find((i) => i.id === l.lineId)!;
            const wanted = dto.lines.find((d) => d.transaction_item_id === l.lineId)?.restock ?? true;
            return wanted && this.isRestockable(line);
          });
          const restockedCost = restockLines.reduce((sum, l) => {
            const line = original.items.find((i) => i.id === l.lineId)!;
            return sum.plus(roundMoney(new Prisma.Decimal(line.unit_cost_snapshot).times(l.quantity)));
          }, new Prisma.Decimal(0));

          const refund = await tx.transaction.create({
            data: {
              business_id: businessId,
              outlet_id: original.outlet_id,
              cashier_id: actor.userId,
              customer_id: original.customer_id,
              cash_drawer_session_id: cashDrawerSessionId,
              transaction_number: refundNumber,
              client_ref: dto.client_ref,
              order_type: original.order_type,
              transaction_type: "refund",
              status: "completed",
              subtotal: computation.subtotal.negated(),
              discount_total: computation.discount.negated(),
              tax_total: computation.tax.negated(),
              service_charge_total: computation.serviceCharge.negated(),
              rounding_adjustment: computation.rounding.negated(),
              total: computation.amount.negated(),
              amount_paid: allocation.paidOut.negated(),
              total_cost: restockedCost.negated(),
              reference_transaction_id: original.id,
              notes: dto.reason,
              completed_at: new Date(),
            },
          });

          for (const l of computation.lines) {
            const line = original.items.find((i) => i.id === l.lineId)!;
            const restocked = restockLines.some((r) => r.lineId === l.lineId);
            await tx.transactionItem.create({
              data: {
                transaction_id: refund.id,
                item_id: line.item_id,
                variant_id: line.variant_id,
                item_name_snapshot: line.item_name_snapshot,
                variant_name_snapshot: line.variant_name_snapshot,
                quantity: l.quantity.negated(),
                unit_price: line.unit_price,
                unit_cost_snapshot: line.unit_cost_snapshot,
                subtotal: l.value.negated(),
                refunded_item_id: line.id,
                notes: restocked ? null : "Tidak dikembalikan ke stok",
              },
            });
          }

          if (channel) {
            await tx.payment.create({
              data: {
                transaction_id: refund.id,
                payment_channel_id: channel.id,
                channel_name_snapshot: channel.name,
                amount: allocation.paidOut.negated(),
              },
            });
          }
          if (openReceivable && allocation.receivableReduction.greaterThan(0)) {
            // Baris kasbon negatif memakai kanal yang sama dengan baris kasbon asli,
            // supaya laporan metode bayar ikut bersih.
            const originalKasbon = original.payments.find((p) => p.is_receivable);
            await tx.payment.create({
              data: {
                transaction_id: refund.id,
                payment_channel_id: originalKasbon?.payment_channel_id ?? null,
                channel_name_snapshot: originalKasbon?.channel_name_snapshot ?? "Kasbon",
                amount: allocation.receivableReduction.negated(),
                is_receivable: true,
              },
            });
            const newAmount = new Prisma.Decimal(openReceivable.amount).minus(allocation.receivableReduction);
            const paid = new Prisma.Decimal(openReceivable.amount_paid);
            await tx.customerReceivable.update({
              where: { id: openReceivable.id },
              data: {
                amount: newAmount,
                ...(paid.greaterThanOrEqualTo(newAmount) ? { status: "paid" as const } : {}),
              },
            });
          }

          await this.restockRefundLines(tx, original.outlet_id, refund.id, refundNumber, actor.userId, restockLines, original.items);

          if (original.customer_id) {
            await tx.customer.update({
              where: { id: original.customer_id },
              data: { total_spent: { decrement: computation.amount } },
            });
            await this.reverseLoyaltyForRefund(tx, original, refund.id, refundNumber, transaction.refundedTotal.plus(computation.amount));
          }

          const fullyRefundedLineIds = lines
            .filter((line) => {
              const now = computation.lines.find((l) => l.lineId === line.id)?.quantity ?? new Prisma.Decimal(0);
              return line.refundedQuantity.plus(now).greaterThanOrEqualTo(line.quantity);
            })
            .map((line) => line.id);
          if (fullyRefundedLineIds.length > 0) {
            await tx.transactionItem.updateMany({ where: { id: { in: fullyRefundedLineIds } }, data: { is_refunded: true } });
          }
          await tx.transaction.update({
            where: { id: original.id },
            data: { status: computation.isFinal ? "refunded" : "partially_refunded" },
          });

          await writeAuditLog(tx, {
            businessId,
            userId: actor.userId,
            action: AUDIT_ACTIONS.REFUND_TRANSACTION,
            entityType: "transaction",
            entityId: original.id,
            oldValue: { status: original.status },
            newValue: {
              status: computation.isFinal ? "refunded" : "partially_refunded",
              refund_id: refund.id,
              refund_number: refundNumber,
              amount: computation.amount.toString(),
              receivable_reduction: allocation.receivableReduction.toString(),
              channel: channel?.name ?? null,
              lines: computation.lines.map((l) => ({ transaction_item_id: l.lineId, quantity: l.quantity.toString() })),
              reason: dto.reason,
            },
            ip: actor.ip,
          });

          return tx.transaction.findUniqueOrThrow({ where: { id: refund.id }, include: TRANSACTION_INCLUDE });
        },
        { maxWait: 10_000, timeout: 20_000 },
      ),
    );
  }

  private toSelection(lines: RefundQuoteDto["lines"]): RefundSelection[] {
    return lines.map((l) => ({ lineId: l.transaction_item_id, quantity: new Prisma.Decimal(l.quantity) }));
  }

  /** Penjualan asli + sisa yang masih bisa di-refund per baris (dari baris refund yang menunjuknya). */
  private async loadRefundable(db: Prisma.TransactionClient, businessId: string, transactionId: string) {
    const original = await db.transaction.findFirst({
      where: { id: transactionId, business_id: businessId },
      include: {
        items: { include: { item: { select: { item_type: true, track_stock: true, use_recipe: true } } } },
        payments: true,
      },
    });
    if (!original) throw new NotFoundException("Transaksi tidak ditemukan");
    if (original.transaction_type !== "sale") throw new BadRequestException("Hanya transaksi penjualan yang bisa di-refund");
    if (original.status !== "completed" && original.status !== "partially_refunded") {
      throw new BadRequestException("Transaksi ini tidak bisa di-refund (belum selesai, dibatalkan, atau sudah di-refund penuh)");
    }

    const refundedPerLine = await db.transactionItem.groupBy({
      by: ["refunded_item_id"],
      where: { refunded_item_id: { in: original.items.map((i) => i.id) }, transaction: { status: { in: COUNTED_STATUSES } } },
      _sum: { quantity: true },
    });
    const refundedTotal = await db.transaction.aggregate({
      where: { reference_transaction_id: original.id, transaction_type: "refund", status: { in: COUNTED_STATUSES } },
      _sum: { total: true },
    });

    const lines: RefundableLine[] = original.items.map((item) => ({
      id: item.id,
      quantity: new Prisma.Decimal(item.quantity),
      subtotal: new Prisma.Decimal(item.subtotal),
      // Baris refund bernilai negatif.
      refundedQuantity: new Prisma.Decimal(
        refundedPerLine.find((r) => r.refunded_item_id === item.id)?._sum.quantity ?? 0,
      ).negated(),
    }));
    const transaction: RefundableTransaction = {
      subtotal: new Prisma.Decimal(original.subtotal),
      discount_total: new Prisma.Decimal(original.discount_total),
      tax_total: new Prisma.Decimal(original.tax_total),
      service_charge_total: new Prisma.Decimal(original.service_charge_total),
      delivery_fee: new Prisma.Decimal(original.delivery_fee),
      total: new Prisma.Decimal(original.total),
      refundedTotal: new Prisma.Decimal(refundedTotal._sum.total ?? 0).negated(),
    };
    return { original, transaction, lines };
  }

  private async unpaidReceivable(db: Prisma.TransactionClient, transactionId: string): Promise<Prisma.Decimal> {
    const receivable = await db.customerReceivable.findFirst({
      where: { transaction_id: transactionId, status: { in: ["outstanding", "partially_paid"] } },
    });
    return receivable ? new Prisma.Decimal(receivable.amount).minus(receivable.amount_paid) : new Prisma.Decimal(0);
  }

  /** Hanya item yang stoknya dilacak langsung — bukan paket (komponen) atau menu resep (bahan). */
  private isRestockable(line: { item_id: string | null; item: { item_type: string; track_stock: boolean; use_recipe: boolean } | null }) {
    return !!line.item_id && !!line.item && line.item.track_stock && !line.item.use_recipe && line.item.item_type !== "bundle";
  }

  private async restockRefundLines(
    tx: Prisma.TransactionClient,
    outletId: string,
    refundId: string,
    refundNumber: string,
    userId: string,
    restockLines: RefundComputation["lines"],
    items: Array<{ id: string; item_id: string | null; variant_id: string | null }>,
  ) {
    const targets = restockLines
      .map((l) => {
        const line = items.find((i) => i.id === l.lineId)!;
        return { item_id: line.item_id!, variant_id: line.variant_id, quantity: l.quantity };
      })
      // Urutan kunci sama dengan reduceStockForItems — tidak deadlock dengan penjualan paralel.
      .sort(compareStockKey);

    for (const target of targets) {
      const rows = await tx.$queryRaw<InventoryLockRow[]>`
        SELECT id, quantity_on_hand FROM inventory
        WHERE outlet_id = ${outletId} AND item_id = ${target.item_id}
          AND variant_id IS NOT DISTINCT FROM ${target.variant_id}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) continue; // item tidak lagi punya baris stok di outlet ini — uang tetap dikembalikan
      await tx.inventory.update({
        where: { id: row.id },
        data: { quantity_on_hand: new Prisma.Decimal(row.quantity_on_hand).plus(target.quantity) },
      });
      await tx.stockMovement.create({
        data: {
          inventory_id: row.id,
          movement_type: "return_in",
          quantity: target.quantity,
          reference_type: "transaction",
          reference_id: refundId,
          notes: `Refund ${refundNumber}`,
          created_by: userId,
        },
      });
    }
  }

  /**
   * Poin dari penjualan asli dikurangi sebanding uang yang dikembalikan:
   * sisa poin yang berhak = floor(poin awal × sisa total / total), dikurangi
   * yang sudah dibalik oleh refund sebelumnya.
   */
  private async reverseLoyaltyForRefund(
    tx: Prisma.TransactionClient,
    original: { id: string; customer_id: string | null; total: Prisma.Decimal },
    refundId: string,
    refundNumber: string,
    refundedTotalAfter: Prisma.Decimal,
  ) {
    if (!original.customer_id) return;
    const earned = (
      await tx.loyaltyPointEntry.aggregate({
        where: { transaction_id: original.id, entry_type: "earn" },
        _sum: { points: true },
      })
    )._sum.points ?? 0;
    if (earned <= 0) return;

    const alreadyReversed = -((
      await tx.loyaltyPointEntry.aggregate({
        where: { entry_type: "adjustment", transaction: { reference_transaction_id: original.id } },
        _sum: { points: true },
      })
    )._sum.points ?? 0);
    const total = new Prisma.Decimal(original.total);
    const remainingTotal = Prisma.Decimal.max(total.minus(refundedTotalAfter), 0);
    const entitled = total.isZero() ? 0 : new Prisma.Decimal(earned).times(remainingTotal).dividedBy(total).floor().toNumber();
    const deduct = earned - entitled - alreadyReversed;
    if (deduct <= 0) return;

    await tx.customer.update({ where: { id: original.customer_id }, data: { loyalty_points: { decrement: deduct } } });
    await tx.loyaltyPointEntry.create({
      data: {
        customer_id: original.customer_id,
        entry_type: "adjustment",
        points: -deduct,
        transaction_id: refundId,
        notes: `Refund ${refundNumber}`,
      },
    });
  }

  // =====================================================================
  // Helper bersama — dipakai createTransaction, openBill, addBillItems, closeBill, quote
  // =====================================================================

  /**
   * Bungkus operasi pembuat transaksi dengan idempotency key (client_ref):
   * - client_ref sudah pernah tersimpan → kembalikan transaksi itu, operasi tidak dijalankan.
   * - Dua request identik balapan → yang kalah kena unique violation
   *   (business_id, client_ref) setelah yang menang commit, seluruh
   *   $transaction-nya di-rollback, lalu dikembalikan transaksi milik pemenang.
   */
  private async withIdempotency(
    businessId: string,
    outletId: string,
    clientRef: string | undefined,
    run: () => Promise<TransactionWithRelations>,
  ): Promise<TransactionWithRelations> {
    if (!clientRef) return run();

    const existing = await this.findByClientRef(businessId, outletId, clientRef);
    if (existing) return existing;

    try {
      return await run();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await this.findByClientRef(businessId, outletId, clientRef);
        if (winner) return winner;
      }
      throw err;
    }
  }

  private async findByClientRef(businessId: string, outletId: string, clientRef: string) {
    const existing = await this.prisma.transaction.findUnique({
      where: { business_id_client_ref: { business_id: businessId, client_ref: clientRef } },
      include: TRANSACTION_INCLUDE,
    });
    if (existing && existing.outlet_id !== outletId) {
      throw new ConflictException("client_ref sudah dipakai untuk transaksi di outlet lain");
    }
    return existing;
  }

  /**
   * Sesi laci yang sedang terbuka di outlet, dikunci FOR SHARE sampai transaksi
   * commit. Tutup laci (FOR NO KEY UPDATE) jadi menunggu penjualan yang sedang
   * berjalan, dan penjualan yang datang sesudahnya melihat laci sudah tertutup —
   * tidak ada uang yang "nyangkut" di sesi yang saldo akhirnya sudah dihitung.
   * FOR SHARE antar-penjualan tidak saling menunggu.
   */
  private async lockOpenDrawerSession(tx: Prisma.TransactionClient, outletId: string): Promise<string | null> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM cash_drawer_sessions
      WHERE outlet_id = ${outletId} AND status = 'open'
      FOR SHARE
    `;
    return rows[0]?.id ?? null;
  }

  private async businessTimeZone(tx: Prisma.TransactionClient, businessId: string): Promise<string> {
    const business = await tx.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
    return resolveTimeZone(business?.timezone);
  }

  /**
   * Harga di titik checkout, dalam urutan: diskon otomatis → voucher (atas sisa)
   * → pajak & service charge (atas subtotal setelah diskon) → ongkir → pembulatan.
   * lockVoucher=true di jalur simpan (createTransaction/closeBill); false untuk quote.
   */
  private async priceCheckout(
    tx: Prisma.TransactionClient,
    businessId: string,
    input: {
      subtotal: Prisma.Decimal;
      lines: DiscountEligibleLine[];
      voucherCode?: string;
      customerId: string | null;
      deliveryFee?: Prisma.Decimal | number | string | null;
      rounding: rounding_mode;
      timeZone: string;
      lockVoucher: boolean;
    },
  ): Promise<CheckoutPricing> {
    const { discountTotal: autoDiscountTotal, discountRows } = await this.resolveAutoDiscounts(
      tx,
      businessId,
      input.subtotal,
      input.lines,
      input.timeZone,
    );
    const remainingAfterAuto = input.subtotal.minus(autoDiscountTotal);
    const voucher = input.voucherCode
      ? await this.resolveVoucher(
          tx,
          businessId,
          input.voucherCode,
          input.subtotal,
          remainingAfterAuto,
          input.customerId,
          input.lockVoucher,
        )
      : null;
    const discountTotal = autoDiscountTotal.plus(voucher?.amount ?? 0);
    const effectiveSubtotal = input.subtotal.minus(discountTotal);

    const { taxTotal, serviceChargeTotal, taxRows } = await this.computeTaxes(tx, businessId, effectiveSubtotal);
    const deliveryFee = new Prisma.Decimal(input.deliveryFee ?? 0);
    const rawTotal = effectiveSubtotal.plus(taxTotal).plus(serviceChargeTotal).plus(deliveryFee);
    const { total, rounding_adjustment } = applyRounding(rawTotal, input.rounding);

    return { discountRows, voucher, discountTotal, taxRows, taxTotal, serviceChargeTotal, deliveryFee, total, rounding_adjustment };
  }

  private toQuote(subtotal: Prisma.Decimal, pricing: CheckoutPricing): CheckoutQuote {
    return {
      subtotal,
      discount_total: pricing.discountTotal,
      discounts: pricing.discountRows.map((d) => ({ name: d.discount_name_snapshot, amount: d.amount_applied })),
      voucher: pricing.voucher ? { code: pricing.voucher.code, amount: pricing.voucher.amount } : null,
      tax_total: pricing.taxTotal,
      service_charge_total: pricing.serviceChargeTotal,
      delivery_fee: pricing.deliveryFee,
      rounding_adjustment: pricing.rounding_adjustment,
      total: pricing.total,
    };
  }

  /** Baris open bill yang sudah tersimpan, dalam bentuk yang dibutuhkan evaluasi diskon. */
  private async billDiscountLines(tx: Prisma.TransactionClient, transactionId: string): Promise<DiscountEligibleLine[]> {
    const persistedItems = await tx.transactionItem.findMany({
      where: { transaction_id: transactionId },
      select: { item_id: true, subtotal: true, item: { select: { category_id: true } } },
    });
    return persistedItems.map((ti) => ({
      item_id: ti.item_id ?? "",
      category_id: ti.item?.category_id ?? null,
      subtotal: new Prisma.Decimal(ti.subtotal),
    }));
  }

  /** Resolusi harga & data snapshot tiap baris item. Tidak menyentuh stok. */
  private async resolveLineItems(
    tx: Prisma.TransactionClient,
    businessId: string,
    outletId: string,
    lines: CreateTransactionItemDto[],
  ): Promise<{ resolvedItems: ResolvedItem[]; subtotal: Prisma.Decimal; totalCost: Prisma.Decimal }> {
    const resolvedItems: ResolvedItem[] = [];
    let subtotal = new Prisma.Decimal(0);
    let totalCost = new Prisma.Decimal(0);

    for (const line of lines) {
      const item = await tx.item.findFirst({
        where: { id: line.item_id, business_id: businessId, is_active: true, deleted_at: null },
      });
      if (!item) throw new NotFoundException(`Item ${line.item_id} tidak ditemukan`);

      const variant = line.variant_id
        ? await tx.itemVariant.findFirst({
            where: { id: line.variant_id, item_id: item.id, is_active: true, deleted_at: null },
          })
        : null;
      if (line.variant_id && !variant) {
        throw new NotFoundException(`Varian ${line.variant_id} tidak ditemukan`);
      }

      const quantity = new Prisma.Decimal(line.quantity);

      // Resolusi harga, dalam urutan prioritas:
      // 1. pricing_type='open' → harga manual dari kasir (SATU-SATUNYA kasus
      //    di mana harga dari client dipercaya — itu memang desainnya).
      // 2. Tier harga grosir yang cocok dengan quantity baris ini (harga final,
      //    bukan tambahan atas base_price).
      // 3. Override harga per outlet — hanya berlaku untuk kombinasi item+variant
      //    (outlet_item_prices.variant_id NOT NULL di skema — keterbatasan desain asli).
      // 4. base_price (+ price_adjustment varian kalau ada).
      let unitPrice: Prisma.Decimal;

      if (item.pricing_type === "open") {
        if (line.unit_price === undefined) {
          throw new BadRequestException(`Item "${item.name}" memerlukan harga manual (pricing_type: open)`);
        }
        unitPrice = new Prisma.Decimal(line.unit_price);
      } else {
        const tier = await tx.priceTier.findFirst({
          where: {
            item_id: item.id,
            variant_id: variant?.id ?? null,
            min_qty: { lte: quantity },
            OR: [{ max_qty: null }, { max_qty: { gte: quantity } }],
          },
          orderBy: { min_qty: "desc" },
        });

        if (tier) {
          unitPrice = tier.price;
        } else if (variant) {
          const override = await tx.outletItemPrice.findUnique({
            where: {
              outlet_id_item_id_variant_id: {
                outlet_id: outletId,
                item_id: item.id,
                variant_id: variant.id,
              },
            },
          });
          unitPrice = override ? override.price : new Prisma.Decimal(item.base_price).plus(variant.price_adjustment);
        } else {
          unitPrice = new Prisma.Decimal(item.base_price);
        }
      }

      const unitCost = variant
        ? new Prisma.Decimal(item.cost_price).plus(variant.cost_adjustment)
        : new Prisma.Decimal(item.cost_price);

      // ── Modifier (topping, level pedas, dst) — divalidasi terhadap grup yang
      // terpasang di item ini, lalu price_adjustment ditambahkan ke unit_price. ──
      const resolvedModifiers = await this.resolveLineModifiers(tx, item.id, item.name, line.modifier_ids ?? []);
      const modifierAdjustment = resolvedModifiers.reduce(
        (sum, m) => sum.plus(m.price_adjustment),
        new Prisma.Decimal(0),
      );
      unitPrice = unitPrice.plus(modifierAdjustment);

      // Dibulatkan per baris (mis. harga/kg × 0,333 kg) — subtotal = jumlah baris di struk.
      const lineSubtotal = roundMoney(unitPrice.times(quantity));
      subtotal = subtotal.plus(lineSubtotal);
      totalCost = totalCost.plus(unitCost.times(quantity));

      resolvedItems.push({
        item_id: item.id,
        variant_id: variant?.id ?? null,
        category_id: item.category_id,
        item_type: item.item_type,
        track_stock: item.track_stock,
        use_recipe: item.use_recipe,
        item_name_snapshot: item.name,
        variant_name_snapshot: variant?.name ?? null,
        quantity,
        unit_price: unitPrice,
        unit_cost_snapshot: unitCost,
        subtotal: lineSubtotal,
        served_by: line.served_by ?? null,
        notes: line.notes ?? null,
        modifiers: resolvedModifiers,
      });
    }

    return { resolvedItems, subtotal, totalCost };
  }

  /**
   * Validasi modifier terpilih untuk satu baris item terhadap modifier_groups
   * yang terpasang di item tsb (harus terpasang, harus aktif, dan mematuhi
   * is_required/min_select/max_select tiap grup).
   */
  private async resolveLineModifiers(
    tx: Prisma.TransactionClient,
    itemId: string,
    itemName: string,
    modifierIds: string[],
  ): Promise<ResolvedModifier[]> {
    // Grup yang sudah dihapus (soft delete) tidak berlaku lagi walau masih terpasang.
    const attachedGroups = await tx.itemModifierGroup.findMany({
      where: { item_id: itemId, modifier_group: { deleted_at: null } },
      include: { modifier_group: true },
    });

    if (modifierIds.length === 0) {
      const missingRequired = attachedGroups.find((g) => g.modifier_group.is_required);
      if (missingRequired) {
        throw new BadRequestException(
          `Item "${itemName}" wajib memilih modifier dari grup "${missingRequired.modifier_group.name}"`,
        );
      }
      return [];
    }

    const attachedGroupIds = new Set(attachedGroups.map((g) => g.modifier_group_id));
    const modifiers = await tx.modifier.findMany({ where: { id: { in: modifierIds }, is_active: true } });
    if (modifiers.length !== modifierIds.length) {
      throw new NotFoundException(`Sebagian modifier untuk item "${itemName}" tidak ditemukan atau nonaktif`);
    }
    for (const m of modifiers) {
      if (!attachedGroupIds.has(m.modifier_group_id)) {
        throw new BadRequestException(`Modifier "${m.name}" tidak berlaku untuk item "${itemName}"`);
      }
    }

    const selectedByGroup = new Map<string, number>();
    for (const m of modifiers) {
      selectedByGroup.set(m.modifier_group_id, (selectedByGroup.get(m.modifier_group_id) ?? 0) + 1);
    }
    for (const g of attachedGroups) {
      const selected = selectedByGroup.get(g.modifier_group_id) ?? 0;
      const group = g.modifier_group;
      if (group.is_required && selected === 0) {
        throw new BadRequestException(`Item "${itemName}" wajib memilih modifier dari grup "${group.name}"`);
      }
      if (selected < group.min_select) {
        throw new BadRequestException(
          `Item "${itemName}" perlu minimal ${group.min_select} pilihan dari grup "${group.name}"`,
        );
      }
      if (selected > group.max_select) {
        throw new BadRequestException(
          `Item "${itemName}" maksimal ${group.max_select} pilihan dari grup "${group.name}"`,
        );
      }
    }

    return modifiers.map((m) => ({
      modifier_id: m.id,
      name: m.name,
      price_adjustment: new Prisma.Decimal(m.price_adjustment),
      ingredient_item_id: m.ingredient_item_id,
      ingredient_qty: m.ingredient_qty ? new Prisma.Decimal(m.ingredient_qty) : null,
    }));
  }

  /** Pajak & service charge aktif (semua tax aktif milik business diterapkan atas subtotal). */
  private async computeTaxes(
    tx: Prisma.TransactionClient,
    businessId: string,
    subtotal: Prisma.Decimal,
  ): Promise<{ taxTotal: Prisma.Decimal; serviceChargeTotal: Prisma.Decimal; taxRows: TaxRow[] }> {
    const activeTaxes = await tx.tax.findMany({ where: { business_id: businessId, is_active: true } });
    let taxTotal = new Prisma.Decimal(0);
    let serviceChargeTotal = new Prisma.Decimal(0);
    const taxRows: TaxRow[] = [];
    for (const tax of activeTaxes) {
      const amount = roundMoney(subtotal.times(tax.rate).dividedBy(100));
      if (tax.tax_kind === "service_charge") {
        serviceChargeTotal = serviceChargeTotal.plus(amount);
      } else {
        taxTotal = taxTotal.plus(amount);
      }
      taxRows.push({ tax_id: tax.id, tax_name_snapshot: tax.name, rate_snapshot: tax.rate, amount });
    }
    return { taxTotal, serviceChargeTotal, taxRows };
  }

  /**
   * Promo otomatis terjadwal (PRD F-12) — semua diskon aktif milik business
   * yang sedang berlaku (tanggal + jam + hari, dalam zona waktu usaha)
   * dievaluasi dan ditumpuk (stacking), masing-masing dipotong dari sisa
   * subtotal secara berurutan supaya totalnya tidak pernah melebihi subtotal.
   */
  private async resolveAutoDiscounts(
    tx: Prisma.TransactionClient,
    businessId: string,
    subtotal: Prisma.Decimal,
    lines: DiscountEligibleLine[],
    timeZone: string,
  ): Promise<{ discountTotal: Prisma.Decimal; discountRows: DiscountRow[] }> {
    const now = new Date();
    const local = zonedParts(now, timeZone);
    const activeDiscounts = await tx.discount.findMany({
      where: {
        business_id: businessId,
        deleted_at: null,
        is_active: true,
        OR: [{ start_date: null }, { start_date: { lte: now } }],
      },
    });

    const discountRows: DiscountRow[] = [];
    let remaining = subtotal;

    for (const discount of activeDiscounts) {
      if (discount.end_date && discount.end_date < now) continue;

      const conditions = (discount.conditions ?? {}) as Record<string, unknown>;

      // Hari & jam promo dibaca sebagai jam dinding usaha, bukan jam server (UTC di Docker).
      if (Array.isArray(conditions.days_of_week) && conditions.days_of_week.length > 0) {
        if (!conditions.days_of_week.includes(local.dayOfWeek)) continue;
      }
      if (typeof conditions.hour_start === "string" && local.hm < conditions.hour_start) continue;
      if (typeof conditions.hour_end === "string" && local.hm > conditions.hour_end) continue;

      let eligibleAmount: Prisma.Decimal;
      if (discount.scope === "category") {
        const categoryIds = Array.isArray(conditions.category_ids) ? (conditions.category_ids as string[]) : [];
        eligibleAmount = lines
          .filter((l) => l.category_id && categoryIds.includes(l.category_id))
          .reduce((sum, l) => sum.plus(l.subtotal), new Prisma.Decimal(0));
      } else if (discount.scope === "specific_items") {
        const itemIds = Array.isArray(conditions.item_ids) ? (conditions.item_ids as string[]) : [];
        eligibleAmount = lines
          .filter((l) => itemIds.includes(l.item_id))
          .reduce((sum, l) => sum.plus(l.subtotal), new Prisma.Decimal(0));
      } else if (discount.scope === "min_purchase") {
        const minAmount = typeof conditions.min_amount === "number" ? conditions.min_amount : 0;
        eligibleAmount = subtotal.greaterThanOrEqualTo(minAmount) ? subtotal : new Prisma.Decimal(0);
      } else {
        eligibleAmount = subtotal; // all_items
      }

      eligibleAmount = Prisma.Decimal.min(eligibleAmount, remaining);
      if (eligibleAmount.lessThanOrEqualTo(0)) continue;

      let amount = roundMoney(
        discount.discount_type === "percentage"
          ? eligibleAmount.times(discount.value).dividedBy(100)
          : Prisma.Decimal.min(discount.value, eligibleAmount),
      );
      amount = Prisma.Decimal.min(amount, remaining);
      if (amount.lessThanOrEqualTo(0)) continue;

      discountRows.push({ discount_id: discount.id, discount_name_snapshot: discount.name, amount_applied: amount });
      remaining = remaining.minus(amount);
      if (remaining.lessThanOrEqualTo(0)) break;
    }

    const discountTotal = discountRows.reduce((sum, r) => sum.plus(r.amount_applied), new Prisma.Decimal(0));
    return { discountTotal, discountRows };
  }

  /**
   * Voucher berkode unik (PRD F-12) — beda dari diskon otomatis, harus
   * dimasukkan manual oleh kasir/pelanggan. Diterapkan atas sisa subtotal
   * SETELAH diskon otomatis (stacking berurutan, bukan dari subtotal mentah).
   */
  private async resolveVoucher(
    tx: Prisma.TransactionClient,
    businessId: string,
    rawCode: string,
    rawSubtotal: Prisma.Decimal,
    remainingSubtotal: Prisma.Decimal,
    customerId: string | null,
    lock: boolean,
  ): Promise<VoucherResult> {
    const code = rawCode.trim().toUpperCase();
    if (lock) {
      // Kunci baris voucher sampai transaksi commit — cek usage_limit &
      // per_customer_limit lalu increment usage_count harus atomik terhadap
      // checkout paralel (outlet lain / closeBill), kalau tidak batas terlampaui.
      // NO KEY UPDATE (bukan UPDATE) supaya tidak bentrok dengan kunci FK
      // (FOR KEY SHARE) yang diambil saat insert voucher_redemptions.
      await tx.$queryRaw`
        SELECT id FROM vouchers
        WHERE business_id = ${businessId} AND code = ${code}
        FOR NO KEY UPDATE
      `;
    }
    const voucher = await tx.voucher.findUnique({ where: { business_id_code: { business_id: businessId, code } } });
    if (!voucher) throw new NotFoundException(`Voucher "${code}" tidak ditemukan`);

    const now = new Date();
    if (!voucher.is_active) throw new BadRequestException(`Voucher "${code}" tidak aktif`);
    if (voucher.start_date && voucher.start_date > now) throw new BadRequestException(`Voucher "${code}" belum berlaku`);
    if (voucher.end_date && voucher.end_date < now) throw new BadRequestException(`Voucher "${code}" sudah kedaluwarsa`);
    if (voucher.usage_limit !== null && voucher.usage_count >= voucher.usage_limit) {
      throw new BadRequestException(`Voucher "${code}" sudah mencapai batas pemakaian`);
    }
    if (rawSubtotal.lessThan(voucher.min_purchase)) {
      throw new BadRequestException(`Voucher "${code}" memerlukan minimal belanja ${voucher.min_purchase.toFixed(2)}`);
    }
    if (customerId && voucher.per_customer_limit > 0) {
      const usedByCustomer = await tx.voucherRedemption.count({
        // Redemption milik transaksi yang di-void tidak dihitung (kuota pelanggan kembali).
        where: { voucher_id: voucher.id, customer_id: customerId, transaction: { status: { not: "void" } } },
      });
      if (usedByCustomer >= voucher.per_customer_limit) {
        throw new BadRequestException(`Voucher "${code}" sudah dipakai maksimal oleh pelanggan ini`);
      }
    }
    if (remainingSubtotal.lessThanOrEqualTo(0)) {
      throw new BadRequestException(`Tidak ada sisa subtotal untuk diterapkan voucher "${code}"`);
    }

    let amount =
      voucher.discount_type === "percentage"
        ? remainingSubtotal.times(voucher.value).dividedBy(100)
        : new Prisma.Decimal(voucher.value);
    if (voucher.discount_type === "percentage" && voucher.max_discount) {
      amount = Prisma.Decimal.min(amount, voucher.max_discount);
    }
    amount = roundMoney(Prisma.Decimal.min(amount, remainingSubtotal));

    return { voucher_id: voucher.id, code, amount };
  }

  private async insertTransactionDiscounts(tx: Prisma.TransactionClient, transactionId: string, rows: DiscountRow[]) {
    for (const r of rows) {
      await tx.transactionDiscount.create({
        data: {
          transaction_id: transactionId,
          discount_id: r.discount_id,
          discount_name_snapshot: r.discount_name_snapshot,
          amount_applied: r.amount_applied,
        },
      });
    }
  }

  private async applyVoucherRedemption(
    tx: Prisma.TransactionClient,
    transactionId: string,
    customerId: string | null,
    voucherId: string,
    amount: Prisma.Decimal,
  ) {
    await tx.voucherRedemption.create({
      data: { voucher_id: voucherId, transaction_id: transactionId, customer_id: customerId, amount_applied: amount },
    });
    await tx.voucher.update({ where: { id: voucherId }, data: { usage_count: { increment: 1 } } });
  }

  private async insertTransactionItems(tx: Prisma.TransactionClient, transactionId: string, items: ResolvedItem[]) {
    for (const line of items) {
      const transactionItem = await tx.transactionItem.create({
        data: {
          transaction_id: transactionId,
          item_id: line.item_id,
          variant_id: line.variant_id,
          served_by: line.served_by,
          item_name_snapshot: line.item_name_snapshot,
          variant_name_snapshot: line.variant_name_snapshot,
          quantity: line.quantity,
          unit_price: line.unit_price,
          unit_cost_snapshot: line.unit_cost_snapshot,
          subtotal: line.subtotal,
          notes: line.notes,
        },
      });

      for (const modifier of line.modifiers) {
        await tx.transactionItemModifier.create({
          data: {
            transaction_item_id: transactionItem.id,
            modifier_id: modifier.modifier_id,
            modifier_name_snapshot: modifier.name,
            price_adjustment_snapshot: modifier.price_adjustment,
          },
        });
      }
    }
  }

  private async insertTransactionTaxes(tx: Prisma.TransactionClient, transactionId: string, taxRows: TaxRow[]) {
    for (const t of taxRows) {
      await tx.transactionTax.create({
        data: {
          transaction_id: transactionId,
          tax_id: t.tax_id,
          tax_name_snapshot: t.tax_name_snapshot,
          rate_snapshot: t.rate_snapshot,
          amount: t.amount,
        },
      });
    }
  }

  private async nextTransactionNumber(
    tx: Prisma.TransactionClient,
    businessId: string,
    outletId: string,
    timeZone: string,
    docType: "transaction" | "refund" = "transaction",
  ): Promise<string> {
    // Tanggal di nomor struk & reset harian counter mengikuti tanggal lokal usaha
    // (bukan jam server — di Docker/UTC hari baru akan dimulai jam 07.00 WIB).
    const { date } = zonedParts(new Date(), timeZone);
    const period = dateOnly(date);
    const counter = await tx.documentCounter.upsert({
      where: {
        business_id_outlet_id_doc_type_period: {
          business_id: businessId,
          outlet_id: outletId,
          doc_type: docType,
          period,
        },
      },
      create: { business_id: businessId, outlet_id: outletId, doc_type: docType, period, last_number: 1 },
      update: { last_number: { increment: 1 } },
    });
    const prefix = docType === "refund" ? "RFD" : "INV";
    const datePart = date.replace(/-/g, "");
    const outletShort = outletId.replace(/-/g, "").slice(0, 6).toUpperCase();
    return `${prefix}-${outletShort}-${datePart}-${String(counter.last_number).padStart(4, "0")}`;
  }

  /**
   * Resolusi pembayaran, kasbon, dan poin loyalty terhadap sebuah transaksi
   * yang SUDAH ADA (baik baru dibuat oleh createTransaction, maupun open bill
   * yang sedang ditutup oleh closeBill). Meng-update baris transactions dengan
   * amount_paid/change_due (+ field tambahan di extraData, mis. status/completed_at
   * untuk closeBill).
   *
   * Aturan uang:
   * - Kembalian hanya bisa diberikan dari uang TUNAI di laci → non-tunai (QRIS,
   *   transfer, kartu) + kasbon tidak boleh melebihi total.
   * - Kasbon hanya menutup SISA tagihan → bila ada porsi kasbon, pembayaran harus
   *   pas (tanpa kembalian); kalau tidak, kasbon berubah jadi pinjaman tunai.
   */
  private async finalizePayment(
    tx: Prisma.TransactionClient,
    businessId: string,
    transaction: { id: string; total: Prisma.Decimal },
    payments: CreateTransactionPaymentDto[],
    customer: { id: string; credit_limit: Prisma.Decimal } | null,
    settings: { enable_kasbon: boolean; enable_loyalty: boolean } | null,
    extraData: Record<string, unknown> = {},
  ): Promise<{ amountPaid: Prisma.Decimal; changeDue: Prisma.Decimal }> {
    let cashTendered = new Prisma.Decimal(0);
    let nonCashPaid = new Prisma.Decimal(0);
    let amountReceivable = new Prisma.Decimal(0);
    const paymentRows: Array<{
      payment_channel_id: string;
      channel_name_snapshot: string;
      amount: Prisma.Decimal;
      fee_amount: Prisma.Decimal;
      reference_number: string | null;
      is_receivable: boolean;
    }> = [];

    for (const p of payments) {
      const channel = await tx.paymentChannel.findFirst({
        where: { id: p.payment_channel_id, business_id: businessId, is_active: true },
      });
      if (!channel) throw new NotFoundException(`Payment channel ${p.payment_channel_id} tidak ditemukan`);

      const amount = new Prisma.Decimal(p.amount);
      const feeAmount = amount.times(channel.fee_percentage).dividedBy(100).plus(channel.fee_fixed);
      const isReceivable = !!p.is_receivable;

      paymentRows.push({
        payment_channel_id: channel.id,
        channel_name_snapshot: channel.name,
        amount,
        fee_amount: feeAmount,
        reference_number: p.reference_number ?? null,
        is_receivable: isReceivable,
      });

      if (isReceivable) amountReceivable = amountReceivable.plus(amount);
      else if (channel.channel_type === "cash") cashTendered = cashTendered.plus(amount);
      else nonCashPaid = nonCashPaid.plus(amount);
    }

    const amountPaid = cashTendered.plus(nonCashPaid);
    const totalCovered = amountPaid.plus(amountReceivable);
    if (totalCovered.lessThan(transaction.total)) {
      throw new BadRequestException(
        `Total pembayaran (${totalCovered.toFixed(2)}) kurang dari total transaksi (${transaction.total.toFixed(2)})`,
      );
    }

    const nonCashAndReceivable = nonCashPaid.plus(amountReceivable);
    if (nonCashAndReceivable.greaterThan(transaction.total)) {
      throw new BadRequestException(
        `Pembayaran non-tunai/kasbon (${nonCashAndReceivable.toFixed(2)}) melebihi total transaksi (${transaction.total.toFixed(2)}) — kembalian hanya bisa dari tunai`,
      );
    }

    if (amountReceivable.greaterThan(0) && totalCovered.greaterThan(transaction.total)) {
      const remaining = Prisma.Decimal.max(transaction.total.minus(amountPaid), 0);
      throw new BadRequestException(
        `Kasbon harus pas sebesar sisa tagihan (${remaining.toFixed(2)}) — kasbon tidak boleh menghasilkan kembalian`,
      );
    }

    if (amountReceivable.greaterThan(0)) {
      if (!customer) throw new BadRequestException("Kasbon memerlukan customer_id");
      if (!settings?.enable_kasbon) throw new BadRequestException("Fitur kasbon tidak aktif untuk bisnis ini");

      // Kunci baris pelanggan supaya dua kasbon paralel untuk pelanggan yang sama
      // (kasir di outlet lain, atau closeBill) tidak sama-sama lolos cek batas kredit.
      // WAJIB NO KEY UPDATE: transaksi ini sudah memegang FOR KEY SHARE atas baris
      // pelanggan (cek FK saat insert transactions.customer_id) — FOR UPDATE akan
      // menunggu KEY SHARE milik transaksi paralel, dan sebaliknya → deadlock.
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id} FOR NO KEY UPDATE`;

      const outstandingAgg = await tx.customerReceivable.aggregate({
        where: { customer_id: customer.id, status: { in: ["outstanding", "partially_paid"] } },
        _sum: { amount: true, amount_paid: true },
      });
      const currentOutstanding = new Prisma.Decimal(outstandingAgg._sum.amount ?? 0).minus(
        new Prisma.Decimal(outstandingAgg._sum.amount_paid ?? 0),
      );
      const newOutstanding = currentOutstanding.plus(amountReceivable);
      if (newOutstanding.greaterThan(customer.credit_limit)) {
        throw new BadRequestException(
          `Kasbon melebihi batas kredit pelanggan (limit ${customer.credit_limit.toFixed(2)}, akan menjadi ${newOutstanding.toFixed(2)})`,
        );
      }
    }

    // Setelah aturan di atas: 0 ≤ kembalian ≤ uang tunai yang diterima.
    const changeDue = totalCovered.minus(transaction.total);

    await tx.transaction.update({
      where: { id: transaction.id },
      data: { amount_paid: amountPaid, change_due: changeDue, ...extraData },
    });

    for (const p of paymentRows) {
      await tx.payment.create({
        data: {
          transaction_id: transaction.id,
          payment_channel_id: p.payment_channel_id,
          channel_name_snapshot: p.channel_name_snapshot,
          amount: p.amount,
          fee_amount: p.fee_amount,
          reference_number: p.reference_number,
          is_receivable: p.is_receivable,
        },
      });
    }

    if (amountReceivable.greaterThan(0) && customer) {
      await tx.customerReceivable.create({
        data: {
          business_id: businessId,
          customer_id: customer.id,
          transaction_id: transaction.id,
          amount: amountReceivable,
          status: "outstanding",
        },
      });
    }

    if (customer) {
      await tx.customer.update({
        where: { id: customer.id },
        data: { total_spent: { increment: transaction.total }, visit_count: { increment: 1 } },
      });

      if (settings?.enable_loyalty) {
        const program = await tx.loyaltyProgram.findFirst({ where: { business_id: businessId, is_active: true } });
        if (program && program.points_per_amount.greaterThan(0)) {
          const pointsEarned = transaction.total.dividedBy(program.points_per_amount).floor().toNumber();
          if (pointsEarned > 0) {
            await tx.customer.update({ where: { id: customer.id }, data: { loyalty_points: { increment: pointsEarned } } });
            await tx.loyaltyPointEntry.create({
              data: {
                customer_id: customer.id,
                entry_type: "earn",
                points: pointsEarned,
                transaction_id: transaction.id,
                notes: `Belanja Rp${transaction.total.toFixed(0)}`,
              },
            });
          }
        }
      }
    }

    return { amountPaid, changeDue };
  }

  /**
   * Kurangi stok sesuai tipe item (lihat collectStockDeductions), mengunci baris
   * inventory dengan SELECT ... FOR UPDATE agar aman dari pembelian bersamaan.
   *
   * Kunci diambil dalam urutan deterministik (item_id, variant_id), BUKAN urutan
   * keranjang: dua transaksi yang menyentuh item yang sama dalam urutan berbeda
   * ([A,B] vs [B,A] — mis. pelayan menambah pesanan open bill sementara kasir
   * checkout) akan antre, bukan saling menunggu sampai Postgres membatalkan salah
   * satunya karena deadlock.
   */
  private async reduceStockForItems(
    tx: Prisma.TransactionClient,
    outletId: string,
    lines: ResolvedItem[],
    transactionId: string,
    cashierId: string,
  ) {
    const deductions = await this.collectStockDeductions(tx, lines);
    deductions.sort(compareStockKey);
    for (const deduction of deductions) {
      await this.lockAndDecrementInventory(tx, outletId, deduction, transactionId, cashierId);
    }
  }

  /**
   * Daftar pengurangan stok per baris — belum menyentuh/mengunci inventory.
   * - item_type='bundle' → kurangi tiap komponen di bundle_components
   * - use_recipe=true → kurangi tiap bahan di recipes
   * - track_stock=true (item biasa) → kurangi inventory item itu sendiri
   * - track_stock=false (jasa) → lewati
   * - modifier dengan ingredient_item_id → kurangi bahannya, independen dari item induk
   */
  private async collectStockDeductions(tx: Prisma.TransactionClient, lines: ResolvedItem[]): Promise<StockDeduction[]> {
    const deductions: StockDeduction[] = [];

    for (const line of lines) {
      if (line.item_type === "bundle") {
        const components = await tx.bundleComponent.findMany({ where: { bundle_item_id: line.item_id } });
        for (const component of components) {
          const componentItem = await tx.item.findUniqueOrThrow({ where: { id: component.component_item_id } });
          if (!componentItem.track_stock) continue;
          deductions.push({
            item_id: component.component_item_id,
            variant_id: component.component_variant_id,
            quantity: new Prisma.Decimal(component.quantity).times(line.quantity),
            movement_type: "sale_out",
            item_name: componentItem.name,
          });
        }
      } else if (line.use_recipe) {
        // Resep umum item (variant_id NULL) + resep khusus varian yang dipilih —
        // tidak pernah resep milik varian lain.
        const recipes = await tx.recipe.findMany({
          where: {
            item_id: line.item_id,
            OR: line.variant_id ? [{ variant_id: null }, { variant_id: line.variant_id }] : [{ variant_id: null }],
          },
        });
        for (const recipe of recipes) {
          const ingredient = await tx.item.findUniqueOrThrow({ where: { id: recipe.ingredient_item_id } });
          deductions.push({
            item_id: recipe.ingredient_item_id,
            variant_id: null,
            quantity: new Prisma.Decimal(recipe.quantity_used).times(line.quantity),
            movement_type: "recipe_out",
            item_name: ingredient.name,
          });
        }
      } else if (line.track_stock) {
        deductions.push({
          item_id: line.item_id,
          variant_id: line.variant_id,
          quantity: line.quantity,
          movement_type: "sale_out",
          item_name: line.item_name_snapshot,
        });
      }

      for (const modifier of line.modifiers) {
        if (!modifier.ingredient_item_id || !modifier.ingredient_qty) continue;
        const ingredient = await tx.item.findUniqueOrThrow({ where: { id: modifier.ingredient_item_id } });
        deductions.push({
          item_id: modifier.ingredient_item_id,
          variant_id: null,
          quantity: modifier.ingredient_qty.times(line.quantity),
          movement_type: "recipe_out",
          item_name: ingredient.name,
        });
      }
    }

    return deductions;
  }

  /**
   * Kembalikan stok sebuah transaksi dengan membalik stock_movements yang
   * tercatat untuknya — persis yang dulu dipotong (bundle, resep, bahan
   * modifier), tidak terpengaruh perubahan katalog sesudahnya.
   *
   * Kunci inventory diambil dalam urutan (item_id, variant_id) yang SAMA dengan
   * reduceStockForItems, supaya void tidak deadlock dengan penjualan paralel
   * yang menyentuh item yang sama.
   */
  private async restoreStockForTransaction(
    tx: Prisma.TransactionClient,
    transactionId: string,
    transactionNumber: string,
    userId: string,
  ) {
    const net = await tx.stockMovement.groupBy({
      by: ["inventory_id"],
      where: { reference_type: "transaction", reference_id: transactionId },
      _sum: { quantity: true },
    });
    const inventories = await tx.inventory.findMany({
      where: { id: { in: net.map((n) => n.inventory_id) } },
      select: { id: true, item_id: true, variant_id: true },
    });
    inventories.sort(compareStockKey);

    for (const inventory of inventories) {
      // Jumlah movement tercatat negatif (keluar); yang dikembalikan = kebalikannya.
      const quantityOut = new Prisma.Decimal(net.find((n) => n.inventory_id === inventory.id)?._sum.quantity ?? 0).negated();
      if (quantityOut.lessThanOrEqualTo(0)) continue;

      const rows = await tx.$queryRaw<InventoryLockRow[]>`
        SELECT id, quantity_on_hand FROM inventory WHERE id = ${inventory.id} FOR UPDATE
      `;
      await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity_on_hand: new Prisma.Decimal(rows[0].quantity_on_hand).plus(quantityOut) },
      });
      await tx.stockMovement.create({
        data: {
          inventory_id: inventory.id,
          movement_type: "return_in",
          quantity: quantityOut,
          reference_type: "transaction",
          reference_id: transactionId,
          notes: `Void ${transactionNumber}`,
          created_by: userId,
        },
      });
    }
  }

  private async lockAndDecrementInventory(
    tx: Prisma.TransactionClient,
    outletId: string,
    deduction: StockDeduction,
    transactionId: string,
    cashierId: string,
  ) {
    const rows = await tx.$queryRaw<InventoryLockRow[]>`
      SELECT id, quantity_on_hand FROM inventory
      WHERE outlet_id = ${outletId} AND item_id = ${deduction.item_id}
        AND variant_id IS NOT DISTINCT FROM ${deduction.variant_id}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) {
      throw new BadRequestException(`Stok "${deduction.item_name}" belum terdaftar di outlet ini`);
    }

    // Baris yang sama bisa muncul lebih dari sekali (mis. item yang sama di dua
    // baris keranjang) — kunci ulang di transaksi yang sama tidak menunggu, dan
    // quantity_on_hand yang dibaca sudah termasuk pengurangan sebelumnya.
    const current = new Prisma.Decimal(row.quantity_on_hand);
    if (current.lessThan(deduction.quantity)) {
      throw new ConflictException(
        `Stok "${deduction.item_name}" tidak cukup (tersedia ${current.toFixed(3)}, diminta ${deduction.quantity.toFixed(3)})`,
      );
    }

    await tx.inventory.update({
      where: { id: row.id },
      data: { quantity_on_hand: current.minus(deduction.quantity) },
    });

    await tx.stockMovement.create({
      data: {
        inventory_id: row.id,
        movement_type: deduction.movement_type,
        quantity: deduction.quantity.negated(),
        reference_type: "transaction",
        reference_id: transactionId,
        created_by: cashierId,
      },
    });
  }
}
