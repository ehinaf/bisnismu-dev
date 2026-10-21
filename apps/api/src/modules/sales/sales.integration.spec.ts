/**
 * Integration test SalesService — butuh Postgres nyata (lihat .env DATABASE_URL).
 * Dijalankan terpisah dari unit test biasa: `pnpm test:integration`.
 * Tidak masuk CI (belum ada service Postgres di GitHub Actions).
 */
import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { zonedParts } from "../../common/utils/business-time";
import { CashdrawerService } from "../cashdrawer/cashdrawer.service";
import { CustomerService } from "../customer/customer.service";
import { SalesService } from "./sales.service";
import { CreateTransactionDto } from "./dto/create-transaction.dto";

describe("SalesService (integration)", () => {
  let prisma: PrismaService;
  let service: SalesService;
  let drawer: CashdrawerService;
  let customers: CustomerService;

  let businessId: string;
  let outletId: string;
  let cashierId: string;
  let paymentChannelId: string;
  let qrisChannelId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new SalesService(prisma);
    drawer = new CashdrawerService(prisma);
    customers = new CustomerService(prisma);

    const business = await prisma.business.create({
      data: { name: `Integration Test Business ${Date.now()}` },
    });
    businessId = business.id;

    const outlet = await prisma.outlet.create({
      data: { business_id: businessId, name: "Outlet Uji" },
    });
    outletId = outlet.id;

    const cashier = await prisma.user.create({
      data: {
        business_id: businessId,
        name: "Kasir Uji",
        email: `cashier-${Date.now()}@integration.test`,
        password_hash: "unused",
        role: "cashier",
      },
    });
    cashierId = cashier.id;

    const channel = await prisma.paymentChannel.create({
      data: { business_id: businessId, name: "Tunai", channel_type: "cash" },
    });
    paymentChannelId = channel.id;

    const qris = await prisma.paymentChannel.create({
      data: { business_id: businessId, name: "QRIS", channel_type: "qris" },
    });
    qrisChannelId = qris.id;
  });

  afterAll(async () => {
    // Business cascade-deletes hampir semua row anak (outlet, item, inventory,
    // transactions, payments, stock_movements, document_counters, dst).
    // Sesi laci dihapus dulu: FK opened_by → users (RESTRICT) bisa mendahului
    // cascade outlet → cash_drawer_sessions.
    await prisma.cashDrawerSession.deleteMany({ where: { outlet: { business_id: businessId } } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  async function createItemWithStock(name: string, stock: number, price = 10000, atOutletId = outletId) {
    const item = await prisma.item.create({
      data: { business_id: businessId, name, base_price: price, cost_price: 6000 },
    });
    await prisma.inventory.create({
      data: { outlet_id: atOutletId, item_id: item.id, quantity_on_hand: stock },
    });
    return item;
  }

  function buildDto(itemId: string, quantity: number, amount: number): CreateTransactionDto {
    return {
      outlet_id: outletId,
      items: [{ item_id: itemId, quantity }],
      payments: [{ payment_channel_id: paymentChannelId, amount }],
    };
  }

  async function stockOf(itemId: string, atOutletId = outletId) {
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { outlet_id: atOutletId, item_id: itemId } });
    return inventory.quantity_on_hand.toNumber();
  }

  /**
   * Buka koneksi pool lebih dulu. Tanpa ini, hanya request pertama yang dapat
   * koneksi siaga — sisanya menunggu koneksi baru (~40 ms) dan baru mulai
   * setelah request pertama commit, sehingga race condition tidak pernah teruji.
   */
  async function warmUpPool(connections = 10) {
    await Promise.all(
      Array.from({ length: connections }, () =>
        prisma.$transaction(async (tx) => tx.$queryRaw`SELECT pg_sleep(0.05)::text AS warm`),
      ),
    );
  }

  function rejectionMessages(results: PromiseSettledResult<unknown>[]) {
    return results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
  }

  it("happy path: membuat transaksi lengkap dan mengurangi stok", async () => {
    const item = await createItemWithStock("Item Happy Path", 10);

    const result = await service.createTransaction(businessId, cashierId, buildDto(item.id, 2, 20000));

    expect(result.subtotal.toNumber()).toBe(20000);
    expect(result.total.toNumber()).toBe(20000);
    expect(result.items).toHaveLength(1);
    expect(result.payments).toHaveLength(1);

    const inventory = await prisma.inventory.findFirst({ where: { outlet_id: outletId, item_id: item.id } });
    expect(inventory!.quantity_on_hand.toNumber()).toBe(8);

    const movements = await prisma.stockMovement.findMany({ where: { inventory_id: inventory!.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0].quantity.toNumber()).toBe(-2);
  });

  it("konkurensi: 20 request paralel beli stok terakhir (5 unit) → tepat 5 sukses", async () => {
    const item = await createItemWithStock("Item Stok Terbatas", 5);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => service.createTransaction(businessId, cashierId, buildDto(item.id, 1, 10000))),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded).toHaveLength(5);
    expect(failed).toHaveLength(15);

    const inventory = await prisma.inventory.findFirst({ where: { outlet_id: outletId, item_id: item.id } });
    expect(inventory!.quantity_on_hand.toNumber()).toBe(0);

    const movements = await prisma.stockMovement.findMany({ where: { inventory_id: inventory!.id } });
    expect(movements).toHaveLength(5);
  });

  it("nomor struk: 20 request paralel → 20 nomor unik", async () => {
    const item = await createItemWithStock("Item Stok Banyak", 1000);

    const results = await Promise.all(
      Array.from({ length: 20 }, () => service.createTransaction(businessId, cashierId, buildDto(item.id, 1, 10000))),
    );

    const numbers = results.map((r) => r.transaction_number);
    const uniqueNumbers = new Set(numbers);
    expect(uniqueNumbers.size).toBe(20);
  });

  it("nomor struk memuat tanggal lokal usaha (Asia/Jakarta), bukan tanggal UTC server", async () => {
    const item = await createItemWithStock("Item Tanggal Struk", 10);

    const result = await service.createTransaction(businessId, cashierId, buildDto(item.id, 1, 10000));

    const localDate = zonedParts(new Date(), "Asia/Jakarta").date.replace(/-/g, "");
    expect(result.transaction_number).toContain(`-${localDate}-`);
  });

  it("rollback: kegagalan di item ke-2 tidak mengubah stok item ke-1", async () => {
    const itemOk = await createItemWithStock("Item Cukup Stok", 10);
    const itemHabis = await createItemWithStock("Item Habis Stok", 0);

    const dto: CreateTransactionDto = {
      outlet_id: outletId,
      items: [
        { item_id: itemOk.id, quantity: 1 },
        { item_id: itemHabis.id, quantity: 1 },
      ],
      payments: [{ payment_channel_id: paymentChannelId, amount: 20000 }],
    };

    await expect(service.createTransaction(businessId, cashierId, dto)).rejects.toThrow();

    const inventoryOk = await prisma.inventory.findFirst({ where: { outlet_id: outletId, item_id: itemOk.id } });
    expect(inventoryOk!.quantity_on_hand.toNumber()).toBe(10);

    const movements = await prisma.stockMovement.findMany({ where: { inventory_id: inventoryOk!.id } });
    expect(movements).toHaveLength(0);
  });

  it("item track_stock=false (jasa) tidak butuh baris inventory", async () => {
    const service_item = await prisma.item.create({
      data: {
        business_id: businessId,
        name: "Jasa Cuci",
        item_type: "service",
        track_stock: false,
        base_price: 15000,
      },
    });

    const result = await service.createTransaction(businessId, cashierId, buildDto(service_item.id, 1, 15000));
    expect(result.total.toNumber()).toBe(15000);
  });

  it("kasbon: pembayaran is_receivable membuat customer_receivables dan menghormati credit_limit", async () => {
    await prisma.businessSetting.upsert({
      where: { business_id: businessId },
      create: { business_id: businessId, enable_kasbon: true },
      update: { enable_kasbon: true },
    });
    const customer = await prisma.customer.create({
      data: { business_id: businessId, name: "Pelanggan Kasbon", credit_limit: 50000 },
    });
    const item = await createItemWithStock("Item Kasbon", 10);

    const dto: CreateTransactionDto = {
      outlet_id: outletId,
      customer_id: customer.id,
      items: [{ item_id: item.id, quantity: 1 }],
      payments: [{ payment_channel_id: paymentChannelId, amount: 10000, is_receivable: true }],
    };

    const result = await service.createTransaction(businessId, cashierId, dto);
    expect(result.total.toNumber()).toBe(10000);

    const receivable = await prisma.customerReceivable.findFirst({ where: { customer_id: customer.id } });
    expect(receivable).not.toBeNull();
    expect(receivable!.amount.toNumber()).toBe(10000);

    const updatedCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(updatedCustomer.total_spent.toNumber()).toBe(10000);
    expect(updatedCustomer.visit_count).toBe(1);
  });

  // ===================================================================
  // Konkurensi & integritas uang (Sprint 1 hardening)
  // ===================================================================

  it("deadlock: checkout & tambah pesanan open bill dengan urutan item berlawanan, paralel berulang → tidak ada yang gagal", async () => {
    const itemA = await createItemWithStock("Item Kunci A", 1000);
    const itemB = await createItemWithStock("Item Kunci B", 1000);
    const bills = [];
    for (let i = 0; i < 4; i++) bills.push(await service.openBill(businessId, cashierId, { outlet_id: outletId }));

    const AB = [
      { item_id: itemA.id, quantity: 1 },
      { item_id: itemB.id, quantity: 1 },
    ];
    const BA = [...AB].reverse();
    const ROUNDS = 15;

    const results: PromiseSettledResult<unknown>[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      results.push(
        ...(await Promise.allSettled([
          service.createTransaction(businessId, cashierId, {
            outlet_id: outletId,
            items: AB,
            payments: [{ payment_channel_id: paymentChannelId, amount: 20000 }],
          }),
          service.addBillItems(businessId, cashierId, bills[0].id, { items: BA }),
          service.addBillItems(businessId, cashierId, bills[1].id, { items: AB }),
          service.addBillItems(businessId, cashierId, bills[2].id, { items: BA }),
          service.addBillItems(businessId, cashierId, bills[3].id, { items: AB }),
        ])),
      );
    }

    expect(rejectionMessages(results)).toEqual([]);
    expect(await stockOf(itemA.id)).toBe(1000 - ROUNDS * 5);
    expect(await stockOf(itemB.id)).toBe(1000 - ROUNDS * 5);
  });

  it("voucher usage_limit=3: 10 checkout paralel → tepat 3 yang berhasil memakai voucher", async () => {
    const item = await createItemWithStock("Item Voucher Paralel", 100);
    const voucher = await prisma.voucher.create({
      data: { business_id: businessId, code: "PARALEL3", discount_type: "fixed_amount", value: 1000, usage_limit: 3 },
    });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        service.createTransaction(businessId, cashierId, { ...buildDto(item.id, 1, 10000), voucher_code: "paralel3" }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    for (const message of rejectionMessages(results)) expect(message).toContain("batas pemakaian");
    const updated = await prisma.voucher.findUniqueOrThrow({ where: { id: voucher.id } });
    expect(updated.usage_count).toBe(3);
    expect(await prisma.voucherRedemption.count({ where: { voucher_id: voucher.id } })).toBe(3);
  });

  it("kasbon paralel dari 4 outlet: credit_limit 50.000, masing-masing 20.000 → tepat 2 berhasil", async () => {
    await prisma.businessSetting.upsert({
      where: { business_id: businessId },
      create: { business_id: businessId, enable_kasbon: true },
      update: { enable_kasbon: true },
    });
    const customer = await prisma.customer.create({
      data: { business_id: businessId, name: "Pelanggan Kasbon Paralel", credit_limit: 50000 },
    });
    const item = await prisma.item.create({
      data: { business_id: businessId, name: "Item Kasbon Paralel", base_price: 20000, cost_price: 10000 },
    });
    const outlets = [];
    for (let i = 0; i < 4; i++) {
      const outlet = await prisma.outlet.create({ data: { business_id: businessId, name: `Outlet Kasbon ${i}` } });
      await prisma.inventory.create({ data: { outlet_id: outlet.id, item_id: item.id, quantity_on_hand: 10 } });
      outlets.push(outlet);
    }

    const results = await Promise.allSettled(
      outlets.map((outlet) =>
        service.createTransaction(businessId, cashierId, {
          outlet_id: outlet.id,
          customer_id: customer.id,
          items: [{ item_id: item.id, quantity: 1 }],
          payments: [{ payment_channel_id: paymentChannelId, amount: 20000, is_receivable: true }],
        }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    for (const message of rejectionMessages(results)) expect(message).toContain("batas kredit");
    const outstanding = await prisma.customerReceivable.aggregate({
      where: { customer_id: customer.id },
      _sum: { amount: true },
    });
    expect(outstanding._sum.amount!.toNumber()).toBe(40000);
  });

  it("cicilan kasbon paralel tidak bisa melebihi sisa piutang", async () => {
    const customer = await prisma.customer.create({
      data: { business_id: businessId, name: "Pelanggan Cicilan", credit_limit: 1000000 },
    });
    const receivable = await prisma.customerReceivable.create({
      data: { business_id: businessId, customer_id: customer.id, amount: 100000 },
    });
    await warmUpPool();

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        customers.addReceivablePayment(businessId, customer.id, receivable.id, cashierId, { amount: 60000 }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const updated = await prisma.customerReceivable.findUniqueOrThrow({ where: { id: receivable.id } });
    expect(updated.amount_paid.toNumber()).toBe(60000);
    expect(updated.status).toBe("partially_paid");
    // Invarian: total cicilan yang tercatat = amount_paid (tanpa kunci → lost update).
    const recorded = await prisma.receivablePayment.aggregate({
      where: { receivable_id: receivable.id },
      _sum: { amount: true },
    });
    expect(recorded._sum.amount!.toNumber()).toBe(60000);
  });

  it("aturan bayar: QRIS melebihi total ditolak, stok tidak berubah", async () => {
    const item = await createItemWithStock("Item QRIS Lebih", 5);

    await expect(
      service.createTransaction(businessId, cashierId, {
        outlet_id: outletId,
        items: [{ item_id: item.id, quantity: 1 }],
        payments: [{ payment_channel_id: qrisChannelId, amount: 15000 }],
      }),
    ).rejects.toThrow("kembalian hanya bisa dari tunai");
    expect(await stockOf(item.id)).toBe(5);
  });

  it("laci: saldo yang diharapkan = modal + tunai diterima − kembalian (QRIS tidak masuk laci)", async () => {
    const drawerOutlet = await prisma.outlet.create({ data: { business_id: businessId, name: "Outlet Laci" } });
    const item = await createItemWithStock("Item Laci", 10, 85000, drawerOutlet.id);
    const session = await drawer.open(businessId, cashierId, { outlet_id: drawerOutlet.id, opening_balance: 200000 });

    const cashSale = await service.createTransaction(businessId, cashierId, {
      outlet_id: drawerOutlet.id,
      items: [{ item_id: item.id, quantity: 1 }],
      payments: [{ payment_channel_id: paymentChannelId, amount: 100000 }],
    });
    expect(cashSale.change_due.toNumber()).toBe(15000);
    expect(cashSale.cash_drawer_session_id).toBe(session.id);
    await service.createTransaction(businessId, cashierId, {
      outlet_id: drawerOutlet.id,
      items: [{ item_id: item.id, quantity: 1 }],
      payments: [{ payment_channel_id: qrisChannelId, amount: 85000 }],
    });

    const closed = await drawer.close(businessId, cashierId, session.id, { closing_balance: 285000 });
    // 200.000 modal + 100.000 diterima − 15.000 kembalian (QRIS 85.000 tidak masuk laci)
    expect(closed.expected_balance!.toNumber()).toBe(285000);
  });

  it("laci: open bill yang dibayar di shift berikutnya tercatat di laci shift berikutnya", async () => {
    const drawerOutlet = await prisma.outlet.create({ data: { business_id: businessId, name: "Outlet Laci Shift" } });
    const item = await createItemWithStock("Item Laci Shift", 10, 50000, drawerOutlet.id);

    const shift1 = await drawer.open(businessId, cashierId, { outlet_id: drawerOutlet.id, opening_balance: 0 });
    const bill = await service.openBill(businessId, cashierId, {
      outlet_id: drawerOutlet.id,
      items: [{ item_id: item.id, quantity: 1 }],
    });
    const closedShift1 = await drawer.close(businessId, cashierId, shift1.id, { closing_balance: 0 });
    expect(closedShift1.expected_balance!.toNumber()).toBe(0);

    const shift2 = await drawer.open(businessId, cashierId, { outlet_id: drawerOutlet.id, opening_balance: 0 });
    const paid = await service.closeBill(businessId, cashierId, bill.id, {
      payments: [{ payment_channel_id: paymentChannelId, amount: 50000 }],
    });
    expect(paid.cash_drawer_session_id).toBe(shift2.id);
    const closedShift2 = await drawer.close(businessId, cashierId, shift2.id, { closing_balance: 50000 });
    expect(closedShift2.expected_balance!.toNumber()).toBe(50000);
  });

  it("laci: 20 permintaan buka laci paralel di outlet yang sama → hanya 1 sesi terbuka", async () => {
    const drawerOutlet = await prisma.outlet.create({ data: { business_id: businessId, name: "Outlet Laci Paralel" } });
    await warmUpPool();

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => drawer.open(businessId, cashierId, { outlet_id: drawerOutlet.id })),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.cashDrawerSession.count({ where: { outlet_id: drawerOutlet.id, status: "open" } })).toBe(1);
  });

  it("idempotency: 5 request paralel dengan client_ref sama → 1 transaksi, stok berkurang sekali", async () => {
    const item = await createItemWithStock("Item Idempoten", 10);
    const dto: CreateTransactionDto = { ...buildDto(item.id, 1, 10000), client_ref: randomUUID() };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.createTransaction(businessId, cashierId, dto)),
    );

    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await prisma.transaction.count({ where: { business_id: businessId, client_ref: dto.client_ref } })).toBe(1);
    expect(await stockOf(item.id)).toBe(9);

    // Retry belakangan (mis. setelah koneksi pulih) tetap mengembalikan transaksi yang sama.
    const retry = await service.createTransaction(businessId, cashierId, dto);
    expect(retry.id).toBe(results[0].id);
    expect(await stockOf(item.id)).toBe(9);
  });

  it("DB menolak baris stok ganda untuk item tanpa varian (UNIQUE NULLS NOT DISTINCT)", async () => {
    const item = await createItemWithStock("Item Stok Unik", 1);

    await expect(
      prisma.inventory.create({ data: { outlet_id: outletId, item_id: item.id, quantity_on_hand: 5 } }),
    ).rejects.toThrow();
  });

  it("quote = angka yang tersimpan (diskon otomatis + pajak + pembulatan rupiah)", async () => {
    const item = await createItemWithStock("Item Quote", 10, 15230);
    const tax = await prisma.tax.create({ data: { business_id: businessId, name: "PB1 11%", rate: 11 } });
    const discount = await prisma.discount.create({
      data: { business_id: businessId, name: "Promo 5%", discount_type: "percentage", value: 5, scope: "all_items" },
    });
    try {
      const quote = await service.quoteTransaction(businessId, {
        outlet_id: outletId,
        items: [{ item_id: item.id, quantity: 1 }],
      });
      // 15.230 − 762 (5%, dibulatkan) = 14.468; PB1 11% = 1.591,48 → 1.591; total 16.059
      expect(quote.discount_total.toNumber()).toBe(762);
      expect(quote.tax_total.toNumber()).toBe(1591);
      expect(quote.total.toNumber()).toBe(16059);

      const saved = await service.createTransaction(businessId, cashierId, {
        outlet_id: outletId,
        items: [{ item_id: item.id, quantity: 1 }],
        payments: [{ payment_channel_id: qrisChannelId, amount: quote.total.toNumber() }],
      });
      expect(saved.total.toNumber()).toBe(quote.total.toNumber());
      expect(saved.discount_total.toNumber()).toBe(quote.discount_total.toNumber());
      expect(saved.tax_total.toNumber()).toBe(quote.tax_total.toNumber());
    } finally {
      // Pajak & diskon aktif memengaruhi total di test lain — selalu dibersihkan.
      await prisma.tax.update({ where: { id: tax.id }, data: { is_active: false } });
      await prisma.discount.update({ where: { id: discount.id }, data: { is_active: false } });
    }
  });
  // ===================================================================
  // Void & batal open bill (Sprint 2)
  // ===================================================================

  const actor = () => ({ userId: cashierId, ip: "127.0.0.1" });

  it("void penjualan: stok item & bahan resep kembali, laci tidak menghitungnya, pelanggan & poin dibalik, audit tercatat", async () => {
    const voidOutlet = await prisma.outlet.create({ data: { business_id: businessId, name: "Outlet Void" } });
    const ingredient = await createItemWithStock("Bahan Resep Void", 100, 1000, voidOutlet.id);
    const plain = await createItemWithStock("Item Void", 10, 20000, voidOutlet.id);
    const recipeItem = await prisma.item.create({
      data: { business_id: businessId, name: "Menu Resep Void", base_price: 30000, use_recipe: true, track_stock: false },
    });
    await prisma.recipe.create({ data: { item_id: recipeItem.id, ingredient_item_id: ingredient.id, quantity_used: 3 } });
    const customer = await prisma.customer.create({ data: { business_id: businessId, name: "Pelanggan Void" } });
    await prisma.businessSetting.upsert({
      where: { business_id: businessId },
      create: { business_id: businessId, enable_loyalty: true },
      update: { enable_loyalty: true },
    });
    await prisma.loyaltyProgram.upsert({
      where: { business_id: businessId },
      create: { business_id: businessId, points_per_amount: 10000 },
      update: { is_active: true, points_per_amount: 10000 },
    });
    const session = await drawer.open(businessId, cashierId, { outlet_id: voidOutlet.id, opening_balance: 100000 });
    try {
      const sale = await service.createTransaction(businessId, cashierId, {
        outlet_id: voidOutlet.id,
        customer_id: customer.id,
        items: [
          { item_id: plain.id, quantity: 2 },
          { item_id: recipeItem.id, quantity: 1 },
        ],
        payments: [{ payment_channel_id: paymentChannelId, amount: 100000 }],
      });
      expect(await stockOf(plain.id, voidOutlet.id)).toBe(8);
      expect(await stockOf(ingredient.id, voidOutlet.id)).toBe(97);
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).loyalty_points).toBe(7);

      const voided = await service.voidTransaction(businessId, sale.id, "Salah input pesanan", actor());
      expect(voided.status).toBe("void");
      expect(voided.void_reason).toBe("Salah input pesanan");
      expect(voided.voided_by).toBe(cashierId);
      expect(await stockOf(plain.id, voidOutlet.id)).toBe(10);
      expect(await stockOf(ingredient.id, voidOutlet.id)).toBe(100);

      const restored = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      expect(restored.total_spent.toNumber()).toBe(0);
      expect(restored.visit_count).toBe(0);
      expect(restored.loyalty_points).toBe(0);

      const audit = await prisma.auditLog.findMany({ where: { entity_type: "transaction", entity_id: sale.id } });
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe("void_transaction");
      expect(audit[0].user_id).toBe(cashierId);

      // Penjualan 70.000 dibayar 100.000 (kembalian 30.000) sudah di-void → laci tetap modal awal.
      const closed = await drawer.close(businessId, cashierId, session.id, { closing_balance: 100000 });
      expect(closed.expected_balance!.toNumber()).toBe(100000);
    } finally {
      await prisma.businessSetting.update({ where: { business_id: businessId }, data: { enable_loyalty: false } });
    }
  });

  it("void ditolak setelah shift laci transaksi itu ditutup; stok tidak berubah", async () => {
    const shiftOutlet = await prisma.outlet.create({ data: { business_id: businessId, name: "Outlet Void Shift" } });
    const item = await createItemWithStock("Item Void Shift", 10, 10000, shiftOutlet.id);
    const session = await drawer.open(businessId, cashierId, { outlet_id: shiftOutlet.id, opening_balance: 0 });
    const sale = await service.createTransaction(businessId, cashierId, {
      outlet_id: shiftOutlet.id,
      items: [{ item_id: item.id, quantity: 1 }],
      payments: [{ payment_channel_id: paymentChannelId, amount: 10000 }],
    });
    await drawer.close(businessId, cashierId, session.id, { closing_balance: 10000 });

    await expect(service.voidTransaction(businessId, sale.id, "Terlambat", actor())).rejects.toThrow(ConflictException);
    expect(await stockOf(item.id, shiftOutlet.id)).toBe(9);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("completed");
  });

  it("batal open bill: stok dari open & tambah pesanan kembali, meja tersedia lagi", async () => {
    const table = await prisma.diningTable.create({ data: { outlet_id: outletId, name: `Meja Void ${Date.now()}` } });
    const item = await createItemWithStock("Item Bill Void", 10);
    const bill = await service.openBill(businessId, cashierId, {
      outlet_id: outletId,
      dining_table_id: table.id,
      items: [{ item_id: item.id, quantity: 3 }],
    });
    await service.addBillItems(businessId, cashierId, bill.id, { items: [{ item_id: item.id, quantity: 2 }] });
    expect(await stockOf(item.id)).toBe(5);
    expect((await prisma.diningTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("occupied");

    const cancelled = await service.voidTransaction(businessId, bill.id, "Tamu batal pesan", actor());
    expect(cancelled.status).toBe("void");
    expect(await stockOf(item.id)).toBe(10);
    expect((await prisma.diningTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("available");
    expect((await service.listOpenBills(businessId, outletId)).some((b) => b.id === bill.id)).toBe(false);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity_id: bill.id } });
    expect(audit.action).toBe("cancel_open_bill");
  });

  it("void mengembalikan kuota voucher (usage_count & batas per pelanggan)", async () => {
    const voucher = await prisma.voucher.create({
      data: {
        business_id: businessId,
        code: `VOID${Date.now()}`.slice(0, 30),
        discount_type: "fixed_amount",
        value: 1000,
        usage_limit: 5,
        per_customer_limit: 1,
      },
    });
    const customer = await prisma.customer.create({ data: { business_id: businessId, name: "Pelanggan Voucher Void" } });
    const item = await createItemWithStock("Item Voucher Void", 10);
    const saleWithVoucher = () =>
      service.createTransaction(businessId, cashierId, {
        outlet_id: outletId,
        customer_id: customer.id,
        voucher_code: voucher.code,
        items: [{ item_id: item.id, quantity: 1 }],
        payments: [{ payment_channel_id: paymentChannelId, amount: 9000 }],
      });

    const first = await saleWithVoucher();
    await expect(saleWithVoucher()).rejects.toThrow(/sudah dipakai maksimal/);

    await service.voidTransaction(businessId, first.id, "Voucher salah pelanggan", actor());
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: voucher.id } })).usage_count).toBe(0);

    await saleWithVoucher();
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: voucher.id } })).usage_count).toBe(1);
  });

  it("void kasbon: belum dicicil → written_off; sudah dicicil → ditolak", async () => {
    await prisma.businessSetting.upsert({
      where: { business_id: businessId },
      create: { business_id: businessId, enable_kasbon: true },
      update: { enable_kasbon: true },
    });
    const customer = await prisma.customer.create({
      data: { business_id: businessId, name: "Pelanggan Kasbon Void", credit_limit: 100000 },
    });
    const item = await createItemWithStock("Item Kasbon Void", 10);
    const kasbonSale = () =>
      service.createTransaction(businessId, cashierId, {
        outlet_id: outletId,
        customer_id: customer.id,
        items: [{ item_id: item.id, quantity: 1 }],
        payments: [{ payment_channel_id: paymentChannelId, amount: 10000, is_receivable: true }],
      });

    const unpaid = await kasbonSale();
    await service.voidTransaction(businessId, unpaid.id, "Batal belanja", actor());
    const writtenOff = await prisma.customerReceivable.findFirstOrThrow({ where: { transaction_id: unpaid.id } });
    expect(writtenOff.status).toBe("written_off");

    const paidPartly = await kasbonSale();
    const receivable = await prisma.customerReceivable.findFirstOrThrow({ where: { transaction_id: paidPartly.id } });
    await customers.addReceivablePayment(businessId, customer.id, receivable.id, cashierId, { amount: 4000 });
    await expect(service.voidTransaction(businessId, paidPartly.id, "Batal", actor())).rejects.toThrow(/sudah dicicil/);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: paidPartly.id } })).status).toBe("completed");
  });

  it("konkurensi: 5 void paralel untuk transaksi yang sama → tepat 1 sukses, stok bertambah sekali", async () => {
    const item = await createItemWithStock("Item Void Paralel", 10);
    const sale = await service.createTransaction(businessId, cashierId, buildDto(item.id, 4, 40000));
    await warmUpPool();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => service.voidTransaction(businessId, sale.id, "Void paralel", actor())),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.every((r) => r.reason instanceof BadRequestException)).toBe(true);
    expect(await stockOf(item.id)).toBe(10);
    expect(await prisma.stockMovement.count({ where: { reference_id: sale.id, movement_type: "return_in" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entity_id: sale.id } })).toBe(1);
  });

  it("deadlock: void & penjualan baru paralel atas item yang sama (urutan berlawanan), berulang → tidak ada yang gagal", async () => {
    const itemA = await createItemWithStock("Item Void Kunci A", 1000);
    const itemB = await createItemWithStock("Item Void Kunci B", 1000);
    const twoItems = (first: string, second: string): CreateTransactionDto => ({
      outlet_id: outletId,
      items: [
        { item_id: first, quantity: 1 },
        { item_id: second, quantity: 1 },
      ],
      payments: [{ payment_channel_id: paymentChannelId, amount: 20000 }],
    });
    const sales = [];
    for (let i = 0; i < 10; i++) sales.push(await service.createTransaction(businessId, cashierId, twoItems(itemA.id, itemB.id)));
    await warmUpPool();

    const results = await Promise.allSettled(
      sales.flatMap((sale) => [
        service.voidTransaction(businessId, sale.id, "Uji kunci", actor()),
        service.createTransaction(businessId, cashierId, twoItems(itemB.id, itemA.id)),
      ]),
    );

    expect(rejectionMessages(results)).toEqual([]);
    // 1000 − 10 (dijual) + 10 (void) − 10 (penjualan paralel) = 990
    expect(await stockOf(itemA.id)).toBe(990);
    expect(await stockOf(itemB.id)).toBe(990);
  });

  it("riwayat: daftar hari ini memuat penjualan selesai & void, tidak memuat open bill", async () => {
    const historyOutlet = await prisma.outlet.create({ data: { business_id: businessId, name: "Outlet Riwayat" } });
    const item = await createItemWithStock("Item Riwayat", 10, 10000, historyOutlet.id);
    const sale = (qty: number) =>
      service.createTransaction(businessId, cashierId, {
        outlet_id: historyOutlet.id,
        items: [{ item_id: item.id, quantity: qty }],
        payments: [{ payment_channel_id: paymentChannelId, amount: qty * 10000 }],
      });
    const kept = await sale(1);
    const voided = await sale(2);
    await service.voidTransaction(businessId, voided.id, "Uji riwayat", actor());
    await service.openBill(businessId, cashierId, { outlet_id: historyOutlet.id, items: [{ item_id: item.id, quantity: 1 }] });

    const list = await service.listTransactions(businessId, historyOutlet.id);
    expect(list.map((t) => t.id)).toEqual([voided.id, kept.id]);
    expect(list[0].status).toBe("void");
    expect(list[0].void_reason).toBe("Uji riwayat");
  });
});
