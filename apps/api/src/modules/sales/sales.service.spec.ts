import { Test } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { SalesService } from "./sales.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTransactionDto } from "./dto/create-transaction.dto";

// Skenario dasar: 1 item track_stock biasa (tanpa varian), tanpa pajak,
// tanpa pelanggan, dibayar tunai pas. Tiap test meng-override sebagian
// method mockTx untuk memicu jalur error tertentu.
function buildMockTx(overrides: Record<string, unknown> = {}) {
  const base = {
    outlet: { findFirst: jest.fn().mockResolvedValue({ id: "outlet-1", business_id: "biz-1" }) },
    customer: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    diningTable: { findFirst: jest.fn() },
    businessSetting: {
      findFirst: jest.fn().mockResolvedValue({
        business_id: "biz-1",
        rounding: "none",
        enable_kasbon: false,
        enable_loyalty: false,
      }),
    },
    item: {
      findFirst: jest.fn().mockResolvedValue({
        id: "item-1",
        business_id: "biz-1",
        name: "Nasi Goreng",
        item_type: "product",
        track_stock: true,
        use_recipe: false,
        base_price: new Prisma.Decimal(20000),
        cost_price: new Prisma.Decimal(11000),
      }),
      findUniqueOrThrow: jest.fn(),
    },
    itemVariant: { findFirst: jest.fn().mockResolvedValue(null) },
    outletItemPrice: { findUnique: jest.fn().mockResolvedValue(null) },
    tax: { findMany: jest.fn().mockResolvedValue([]) },
    paymentChannel: {
      findFirst: jest.fn().mockResolvedValue({
        id: "channel-1",
        business_id: "biz-1",
        name: "Tunai",
        fee_percentage: new Prisma.Decimal(0),
        fee_fixed: new Prisma.Decimal(0),
        is_active: true,
      }),
    },
    customerReceivable: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null, amount_paid: null } }),
      create: jest.fn().mockResolvedValue({}),
    },
    documentCounter: {
      upsert: jest.fn().mockResolvedValue({ last_number: 1 }),
    },
    transaction: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "txn-1", ...data })),
      findUniqueOrThrow: jest.fn().mockImplementation(() =>
        Promise.resolve({ id: "txn-1", items: [], payments: [], taxes: [] }),
      ),
    },
    transactionItem: { create: jest.fn().mockResolvedValue({}) },
    transactionTax: { create: jest.fn().mockResolvedValue({}) },
    bundleComponent: { findMany: jest.fn().mockResolvedValue([]) },
    recipe: { findMany: jest.fn().mockResolvedValue([]) },
    inventory: { update: jest.fn().mockResolvedValue({}) },
    stockMovement: { create: jest.fn().mockResolvedValue({}) },
    payment: { create: jest.fn().mockResolvedValue({}) },
    loyaltyProgram: { findFirst: jest.fn().mockResolvedValue(null) },
    loyaltyPointEntry: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ id: "inv-1", quantity_on_hand: new Prisma.Decimal(50) }]),
  };

  return { ...base, ...overrides } as any;
}

describe("SalesService", () => {
  let service: SalesService;
  let prisma: { $transaction: jest.Mock };

  const baseDto: CreateTransactionDto = {
    outlet_id: "outlet-1",
    items: [{ item_id: "item-1", quantity: 1 }],
    payments: [{ payment_channel_id: "channel-1", amount: 20000 }],
  };

  async function run(dto: CreateTransactionDto, mockTx: ReturnType<typeof buildMockTx>) {
    prisma.$transaction.mockImplementation((fn: any) => fn(mockTx));
    return service.createTransaction("biz-1", "cashier-1", dto);
  }

  beforeEach(async () => {
    prisma = { $transaction: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [SalesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SalesService);
  });

  it("happy path: menghitung subtotal & total dengan benar, mengurangi stok", async () => {
    const mockTx = buildMockTx();
    const result = await run(baseDto, mockTx);

    expect(result.id).toBe("txn-1");
    expect(mockTx.transaction.create).toHaveBeenCalledTimes(1);
    const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
    expect(createArgs.subtotal.toNumber()).toBe(20000);
    expect(createArgs.total.toNumber()).toBe(20000);
    expect(createArgs.amount_paid.toNumber()).toBe(20000);
    expect(createArgs.change_due.toNumber()).toBe(0);
    expect(mockTx.inventory.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { quantity_on_hand: expect.objectContaining({}) },
    });
    expect(mockTx.stockMovement.create).toHaveBeenCalled();
  });

  it("menolak jika item tidak ditemukan", async () => {
    const mockTx = buildMockTx({ item: { findFirst: jest.fn().mockResolvedValue(null), findUniqueOrThrow: jest.fn() } });
    await expect(run(baseDto, mockTx)).rejects.toThrow(NotFoundException);
  });

  it("menolak jika stok tidak cukup (ConflictException), tidak sampai insert payment", async () => {
    const mockTx = buildMockTx({
      $queryRaw: jest.fn().mockResolvedValue([{ id: "inv-1", quantity_on_hand: new Prisma.Decimal(0) }]),
    });
    await expect(run(baseDto, mockTx)).rejects.toThrow(ConflictException);
    expect(mockTx.payment.create).not.toHaveBeenCalled();
  });

  it("menolak jika total pembayaran kurang dari total transaksi", async () => {
    const dto: CreateTransactionDto = {
      ...baseDto,
      payments: [{ payment_channel_id: "channel-1", amount: 5000 }],
    };
    const mockTx = buildMockTx();
    await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
  });

  it("menolak kasbon tanpa customer_id", async () => {
    const dto: CreateTransactionDto = {
      ...baseDto,
      payments: [{ payment_channel_id: "channel-1", amount: 20000, is_receivable: true }],
    };
    const mockTx = buildMockTx();
    await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
  });

  it("menolak kasbon jika enable_kasbon nonaktif", async () => {
    const dto: CreateTransactionDto = {
      ...baseDto,
      customer_id: "cust-1",
      payments: [{ payment_channel_id: "channel-1", amount: 20000, is_receivable: true }],
    };
    const mockTx = buildMockTx({
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: "cust-1", credit_limit: new Prisma.Decimal(100000) }),
        update: jest.fn(),
      },
    });
    await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
  });

  it("menolak kasbon yang melebihi credit_limit", async () => {
    const dto: CreateTransactionDto = {
      ...baseDto,
      customer_id: "cust-1",
      payments: [{ payment_channel_id: "channel-1", amount: 20000, is_receivable: true }],
    };
    const mockTx = buildMockTx({
      businessSetting: {
        findFirst: jest.fn().mockResolvedValue({ rounding: "none", enable_kasbon: true, enable_loyalty: false }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: "cust-1", credit_limit: new Prisma.Decimal(10000) }),
        update: jest.fn(),
      },
      customerReceivable: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null, amount_paid: null } }),
        create: jest.fn(),
      },
    });
    await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
  });

  it("item track_stock=false (jasa) dilewati saat pengurangan stok", async () => {
    const mockTx = buildMockTx({
      item: {
        findFirst: jest.fn().mockResolvedValue({
          id: "item-2",
          business_id: "biz-1",
          name: "Cuci Sepatu",
          item_type: "service",
          track_stock: false,
          use_recipe: false,
          base_price: new Prisma.Decimal(15000),
          cost_price: new Prisma.Decimal(0),
        }),
        findUniqueOrThrow: jest.fn(),
      },
    });
    const dto: CreateTransactionDto = {
      outlet_id: "outlet-1",
      items: [{ item_id: "item-2", quantity: 1 }],
      payments: [{ payment_channel_id: "channel-1", amount: 15000 }],
    };
    await run(dto, mockTx);
    expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    expect(mockTx.inventory.update).not.toHaveBeenCalled();
  });
});
