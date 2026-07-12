import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { CreateTransactionItemDto } from "./dto/create-transaction-item.dto";
import { CreateTransactionPaymentDto } from "./dto/create-transaction-payment.dto";
import { OpenBillDto } from "./dto/open-bill.dto";
import { AddBillItemsDto } from "./dto/add-bill-items.dto";
import { CloseBillDto } from "./dto/close-bill.dto";
import { applyRounding } from "./sales.pricing";

// Tipe minimal untuk baris hasil raw query SELECT ... FOR UPDATE.
interface InventoryLockRow {
  id: string;
  quantity_on_hand: Prisma.Decimal | string;
}

interface ResolvedItem {
  item_id: string;
  variant_id: string | null;
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
}

interface TaxRow {
  tax_id: string;
  tax_name_snapshot: string;
  rate_snapshot: Prisma.Decimal;
  amount: Prisma.Decimal;
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async createTransaction(businessId: string, cashierId: string, dto: CreateTransactionDto) {
    return this.prisma.$transaction(
      async (tx) => {
        // ── 1. Validasi konteks (outlet, customer, meja) — semua WAJIB milik business_id ini ──
        const outlet = await tx.outlet.findFirst({
          where: { id: dto.outlet_id, business_id: businessId, deleted_at: null },
        });
        if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");

        // Sesi laci terbuka di outlet ini ditautkan otomatis jika ada — TIDAK wajib,
        // supaya modul cashdrawer tetap independen (belum buka laci ≠ tidak bisa jual).
        const openCashDrawerSession = await tx.cashDrawerSession.findFirst({
          where: { outlet_id: dto.outlet_id, status: "open" },
        });

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

        // ── 2. Resolusi harga tiap baris item ──
        const { resolvedItems, subtotal, totalCost } = await this.resolveLineItems(
          tx,
          businessId,
          dto.outlet_id,
          dto.items,
        );

        // ── 3. Pajak & service charge ──
        const { taxTotal, serviceChargeTotal, taxRows } = await this.computeTaxes(tx, businessId, subtotal);

        // ── 4. Total & pembulatan (diskon belum diimplementasikan — lihat README modul sales) ──
        const deliveryFee = dto.delivery_fee ? new Prisma.Decimal(dto.delivery_fee) : new Prisma.Decimal(0);
        const rawTotal = subtotal.plus(taxTotal).plus(serviceChargeTotal).plus(deliveryFee);
        const { total, rounding_adjustment } = applyRounding(rawTotal, settings?.rounding ?? "none");

        // ── 5. Nomor struk atomik (document_counters) ──
        const transactionNumber = await this.nextTransactionNumber(tx, businessId, dto.outlet_id, outlet.id);

        // ── 6. Insert transactions (amount_paid/change_due diisi finalizePayment di bawah) ──
        const transaction = await tx.transaction.create({
          data: {
            business_id: businessId,
            outlet_id: dto.outlet_id,
            cashier_id: cashierId,
            customer_id: customer?.id,
            dining_table_id: dto.dining_table_id,
            cash_drawer_session_id: openCashDrawerSession?.id,
            transaction_number: transactionNumber,
            order_type: dto.order_type ?? "retail",
            status: "completed",
            guest_count: dto.guest_count,
            subtotal,
            tax_total: taxTotal,
            service_charge_total: serviceChargeTotal,
            rounding_adjustment,
            total,
            total_cost: totalCost,
            delivery_address: dto.delivery_address,
            delivery_fee: deliveryFee,
            notes: dto.notes,
            completed_at: new Date(),
          },
        });

        // ── 7. Insert transaction_items (snapshot) ──
        await this.insertTransactionItems(tx, transaction.id, resolvedItems);

        // ── 8. Insert transaction_taxes (snapshot) ──
        await this.insertTransactionTaxes(tx, transaction.id, taxRows);

        // ── 9. Kurangi stok (SELECT ... FOR UPDATE) ──
        await this.reduceStockForItems(tx, dto.outlet_id, resolvedItems, transaction.id, cashierId);

        // ── 10. Pembayaran, kasbon, poin loyalty ──
        await this.finalizePayment(tx, businessId, { id: transaction.id, total }, dto.payments, customer, settings);

        // ── 11. Kembalikan transaksi lengkap ──
        return tx.transaction.findUniqueOrThrow({
          where: { id: transaction.id },
          include: { items: true, payments: true, taxes: true },
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  async getTransactionById(businessId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, business_id: businessId },
      include: { items: true, payments: true, taxes: true },
    });
    if (!transaction) throw new NotFoundException("Transaksi tidak ditemukan");
    return transaction;
  }

  // =====================================================================
  // OPEN BILL — dine-in / hold order (PRD §4.2)
  // Berbeda dari createTransaction: transaksi dibuat status='open' TANPA
  // pembayaran, item bisa ditambah belakangan (addBillItems), baru
  // pembayaran diproses saat closeBill.
  // =====================================================================

  async openBill(businessId: string, cashierId: string, dto: OpenBillDto) {
    return this.prisma.$transaction(
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
        const { taxTotal, serviceChargeTotal, taxRows } = await this.computeTaxes(tx, businessId, subtotal);
        const rawTotal = subtotal.plus(taxTotal).plus(serviceChargeTotal);
        const { total, rounding_adjustment } = applyRounding(rawTotal, settings?.rounding ?? "none");

        const transactionNumber = await this.nextTransactionNumber(tx, businessId, dto.outlet_id, outlet.id);

        const transaction = await tx.transaction.create({
          data: {
            business_id: businessId,
            outlet_id: dto.outlet_id,
            cashier_id: cashierId,
            customer_id: customer?.id,
            dining_table_id: tableId,
            cash_drawer_session_id: openCashDrawerSession?.id,
            transaction_number: transactionNumber,
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
          include: { items: true, payments: true, taxes: true },
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
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
          include: { items: true, payments: true, taxes: true },
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  async closeBill(businessId: string, userId: string, transactionId: string, dto: CloseBillDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const lockedRows = await tx.$queryRaw<
          Array<{ id: string; status: string; total: Prisma.Decimal | string; customer_id: string | null; dining_table_id: string | null }>
        >`
          SELECT id, status, total, customer_id, dining_table_id FROM transactions
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
        const total = new Prisma.Decimal(locked.total);

        await this.finalizePayment(tx, businessId, { id: transactionId, total }, dto.payments, customer, settings, {
          status: "completed",
          completed_at: new Date(),
        });

        if (locked.dining_table_id) {
          await tx.diningTable.update({ where: { id: locked.dining_table_id }, data: { status: "available" } });
        }

        return tx.transaction.findUniqueOrThrow({
          where: { id: transactionId },
          include: { items: true, payments: true, taxes: true },
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

  // =====================================================================
  // Helper bersama — dipakai createTransaction, openBill, addBillItems, closeBill
  // =====================================================================

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

      const lineSubtotal = unitPrice.times(quantity);
      subtotal = subtotal.plus(lineSubtotal);
      totalCost = totalCost.plus(unitCost.times(quantity));

      resolvedItems.push({
        item_id: item.id,
        variant_id: variant?.id ?? null,
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
      });
    }

    return { resolvedItems, subtotal, totalCost };
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
      const amount = subtotal.times(tax.rate).dividedBy(100);
      if (tax.tax_kind === "service_charge") {
        serviceChargeTotal = serviceChargeTotal.plus(amount);
      } else {
        taxTotal = taxTotal.plus(amount);
      }
      taxRows.push({ tax_id: tax.id, tax_name_snapshot: tax.name, rate_snapshot: tax.rate, amount });
    }
    return { taxTotal, serviceChargeTotal, taxRows };
  }

  private async insertTransactionItems(tx: Prisma.TransactionClient, transactionId: string, items: ResolvedItem[]) {
    for (const line of items) {
      await tx.transactionItem.create({
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
    outletDbId: string,
  ): Promise<string> {
    const period = new Date();
    period.setHours(0, 0, 0, 0);
    const counter = await tx.documentCounter.upsert({
      where: {
        business_id_outlet_id_doc_type_period: {
          business_id: businessId,
          outlet_id: outletId,
          doc_type: "transaction",
          period,
        },
      },
      create: { business_id: businessId, outlet_id: outletId, doc_type: "transaction", period, last_number: 1 },
      update: { last_number: { increment: 1 } },
    });
    const datePart = period.toISOString().slice(0, 10).replace(/-/g, "");
    const outletShort = outletDbId.replace(/-/g, "").slice(0, 6).toUpperCase();
    return `INV-${outletShort}-${datePart}-${String(counter.last_number).padStart(4, "0")}`;
  }

  /**
   * Resolusi pembayaran, kasbon, dan poin loyalty terhadap sebuah transaksi
   * yang SUDAH ADA (baik baru dibuat oleh createTransaction/openBill, maupun
   * open bill yang sedang ditutup oleh closeBill). Meng-update baris
   * transactions dengan amount_paid/change_due (+ field tambahan di extraData,
   * mis. status/completed_at untuk closeBill).
   */
  private async finalizePayment(
    tx: Prisma.TransactionClient,
    businessId: string,
    transaction: { id: string; total: Prisma.Decimal },
    payments: CreateTransactionPaymentDto[],
    customer: { id: string; credit_limit: Prisma.Decimal } | null,
    settings: { enable_kasbon: boolean; enable_loyalty: boolean } | null,
    extraData: Record<string, unknown> = {},
  ): Promise<{ amountPaidCash: Prisma.Decimal; changeDue: Prisma.Decimal }> {
    let amountPaidCash = new Prisma.Decimal(0);
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
      else amountPaidCash = amountPaidCash.plus(amount);
    }

    const totalCovered = amountPaidCash.plus(amountReceivable);
    if (totalCovered.lessThan(transaction.total)) {
      throw new BadRequestException(
        `Total pembayaran (${totalCovered.toFixed(2)}) kurang dari total transaksi (${transaction.total.toFixed(2)})`,
      );
    }

    if (amountReceivable.greaterThan(0)) {
      if (!customer) throw new BadRequestException("Kasbon memerlukan customer_id");
      if (!settings?.enable_kasbon) throw new BadRequestException("Fitur kasbon tidak aktif untuk bisnis ini");

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

    const changeDue = totalCovered.greaterThan(transaction.total) ? totalCovered.minus(transaction.total) : new Prisma.Decimal(0);

    await tx.transaction.update({
      where: { id: transaction.id },
      data: { amount_paid: amountPaidCash, change_due: changeDue, ...extraData },
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

    return { amountPaidCash, changeDue };
  }

  /**
   * Kurangi stok sesuai tipe item, mengunci baris inventory dengan
   * SELECT ... FOR UPDATE agar aman dari race condition pembelian bersamaan.
   * - item_type='bundle' → kurangi tiap komponen di bundle_components
   * - use_recipe=true → kurangi tiap bahan di recipes
   * - track_stock=true (item biasa) → kurangi inventory item itu sendiri
   * - track_stock=false (jasa) → lewati
   */
  private async reduceStockForItems(
    tx: Prisma.TransactionClient,
    outletId: string,
    lines: ResolvedItem[],
    transactionId: string,
    cashierId: string,
  ) {
    for (const line of lines) {
      if (line.item_type === "bundle") {
        const components = await tx.bundleComponent.findMany({ where: { bundle_item_id: line.item_id } });
        for (const component of components) {
          const componentItem = await tx.item.findUniqueOrThrow({ where: { id: component.component_item_id } });
          if (!componentItem.track_stock) continue;
          const qty = new Prisma.Decimal(component.quantity).times(line.quantity);
          await this.lockAndDecrementInventory(
            tx,
            outletId,
            component.component_item_id,
            component.component_variant_id,
            qty,
            "sale_out",
            transactionId,
            cashierId,
            componentItem.name,
          );
        }
      } else if (line.use_recipe) {
        const recipes = await tx.recipe.findMany({
          where: {
            item_id: line.item_id,
            OR: [{ variant_id: null }, { variant_id: line.variant_id ?? undefined }],
          },
        });
        for (const recipe of recipes) {
          const ingredient = await tx.item.findUniqueOrThrow({ where: { id: recipe.ingredient_item_id } });
          const qty = new Prisma.Decimal(recipe.quantity_used).times(line.quantity);
          await this.lockAndDecrementInventory(
            tx,
            outletId,
            recipe.ingredient_item_id,
            null,
            qty,
            "recipe_out",
            transactionId,
            cashierId,
            ingredient.name,
          );
        }
      } else if (line.track_stock) {
        await this.lockAndDecrementInventory(
          tx,
          outletId,
          line.item_id,
          line.variant_id,
          line.quantity,
          "sale_out",
          transactionId,
          cashierId,
          line.item_name_snapshot,
        );
      }
      // track_stock=false (jasa) → lewati, tidak menyentuh stok
    }
  }

  private async lockAndDecrementInventory(
    tx: Prisma.TransactionClient,
    outletId: string,
    itemId: string,
    variantId: string | null,
    quantity: Prisma.Decimal,
    movementType: "sale_out" | "recipe_out",
    transactionId: string,
    cashierId: string,
    itemNameForError: string,
  ) {
    const rows = await tx.$queryRaw<InventoryLockRow[]>`
      SELECT id, quantity_on_hand FROM inventory
      WHERE outlet_id = ${outletId} AND item_id = ${itemId} AND variant_id IS NOT DISTINCT FROM ${variantId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) {
      throw new BadRequestException(`Stok "${itemNameForError}" belum terdaftar di outlet ini`);
    }

    const current = new Prisma.Decimal(row.quantity_on_hand);
    if (current.lessThan(quantity)) {
      throw new ConflictException(
        `Stok "${itemNameForError}" tidak cukup (tersedia ${current.toFixed(3)}, diminta ${quantity.toFixed(3)})`,
      );
    }

    await tx.inventory.update({
      where: { id: row.id },
      data: { quantity_on_hand: current.minus(quantity) },
    });

    await tx.stockMovement.create({
      data: {
        inventory_id: row.id,
        movement_type: movementType,
        quantity: quantity.negated(),
        reference_type: "transaction",
        reference_id: transactionId,
        created_by: cashierId,
      },
    });
  }
}
