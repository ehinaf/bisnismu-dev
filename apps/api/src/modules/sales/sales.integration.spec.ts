/**
 * Integration test SalesService — butuh Postgres nyata (lihat .env DATABASE_URL).
 * Dijalankan terpisah dari unit test biasa: `pnpm test:integration`.
 * Tidak masuk CI (belum ada service Postgres di GitHub Actions).
 */
import { PrismaService } from "../../prisma/prisma.service";
import { SalesService } from "./sales.service";
import { CreateTransactionDto } from "./dto/create-transaction.dto";

describe("SalesService (integration)", () => {
  let prisma: PrismaService;
  let service: SalesService;

  let businessId: string;
  let outletId: string;
  let cashierId: string;
  let paymentChannelId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new SalesService(prisma);

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
  });

  afterAll(async () => {
    // Business cascade-deletes hampir semua row anak (outlet, item, inventory,
    // transactions, payments, stock_movements, document_counters, dst).
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  async function createItemWithStock(name: string, stock: number) {
    const item = await prisma.item.create({
      data: { business_id: businessId, name, base_price: 10000, cost_price: 6000 },
    });
    await prisma.inventory.create({
      data: { outlet_id: outletId, item_id: item.id, quantity_on_hand: stock },
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
});
