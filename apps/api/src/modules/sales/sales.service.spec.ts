import { Test } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { SalesService } from "./sales.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTransactionDto } from "./dto/create-transaction.dto";

// Skenario dasar: 1 item track_stock biasa (tanpa varian), tanpa pajak,
// tanpa pelanggan, dibayar tunai pas, usaha di Asia/Jakarta. Tiap test
// meng-override sebagian method mockTx untuk memicu jalur error tertentu.
function buildMockTx(overrides: Record<string, unknown> = {}) {
  const base = {
    business: { findUnique: jest.fn().mockResolvedValue({ timezone: "Asia/Jakarta" }) },
    outlet: { findFirst: jest.fn().mockResolvedValue({ id: "outlet-1", business_id: "biz-1" }) },
    cashDrawerSession: { findFirst: jest.fn().mockResolvedValue(null) },
    customer: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    diningTable: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
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
    priceTier: { findFirst: jest.fn().mockResolvedValue(null) },
    tax: { findMany: jest.fn().mockResolvedValue([]) },
    paymentChannel: {
      findFirst: jest.fn().mockResolvedValue({
        id: "channel-1",
        business_id: "biz-1",
        name: "Tunai",
        channel_type: "cash",
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
      update: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest.fn().mockImplementation(() =>
        Promise.resolve({ id: "txn-1", items: [], payments: [], taxes: [] }),
      ),
    },
    transactionItem: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "txn-item-1", ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    transactionItemModifier: { create: jest.fn().mockResolvedValue({}) },
    transactionTax: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
    transactionDiscount: { create: jest.fn().mockResolvedValue({}) },
    itemModifierGroup: { findMany: jest.fn().mockResolvedValue([]) },
    modifier: { findMany: jest.fn().mockResolvedValue([]) },
    discount: { findMany: jest.fn().mockResolvedValue([]) },
    voucher: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
    voucherRedemption: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) },
    bundleComponent: { findMany: jest.fn().mockResolvedValue([]) },
    recipe: { findMany: jest.fn().mockResolvedValue([]) },
    inventory: { update: jest.fn().mockResolvedValue({}) },
    stockMovement: { create: jest.fn().mockResolvedValue({}) },
    payment: { create: jest.fn().mockResolvedValue({}) },
    loyaltyProgram: { findFirst: jest.fn().mockResolvedValue(null) },
    loyaltyPointEntry: { create: jest.fn().mockResolvedValue({}) },
    // Kunci baris inventory → stok 50; kunci lain (sesi laci, voucher, pelanggan) → tidak ada baris.
    $queryRaw: jest
      .fn()
      .mockImplementation((strings: TemplateStringsArray) =>
        Promise.resolve(
          rawSql(strings).includes("FROM inventory") ? [{ id: "inv-1", quantity_on_hand: new Prisma.Decimal(50) }] : [],
        ),
      ),
  };

  return { ...base, ...overrides } as any;
}

function rawSql(strings: TemplateStringsArray | string[]): string {
  return strings.join("?");
}

/** Argumen tiap panggilan $queryRaw yang SQL-nya memuat `fragment`. */
function rawCallsMatching(queryRaw: jest.Mock, fragment: string): unknown[][] {
  return queryRaw.mock.calls.filter((c: any[]) => rawSql(c[0]).includes(fragment));
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
    const updateArgs = mockTx.transaction.update.mock.calls[0][0].data;
    expect(updateArgs.amount_paid.toNumber()).toBe(20000);
    expect(updateArgs.change_due.toNumber()).toBe(0);
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
    expect(rawCallsMatching(mockTx.$queryRaw, "FROM inventory")).toHaveLength(0);
    expect(mockTx.inventory.update).not.toHaveBeenCalled();
  });

  describe("pricing_type='open'", () => {
    const openItem = {
      id: "item-open",
      business_id: "biz-1",
      name: "Jasa Custom",
      item_type: "service",
      pricing_type: "open",
      track_stock: false,
      use_recipe: false,
      base_price: new Prisma.Decimal(0),
      cost_price: new Prisma.Decimal(0),
    };

    it("menolak jika unit_price tidak diberikan", async () => {
      const mockTx = buildMockTx({ item: { findFirst: jest.fn().mockResolvedValue(openItem), findUniqueOrThrow: jest.fn() } });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-open", quantity: 1 }],
        payments: [{ payment_channel_id: "channel-1", amount: 1 }],
      };
      await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
    });

    it("memakai unit_price dari client apa adanya", async () => {
      const mockTx = buildMockTx({ item: { findFirst: jest.fn().mockResolvedValue(openItem), findUniqueOrThrow: jest.fn() } });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-open", quantity: 1, unit_price: 75000 }],
        payments: [{ payment_channel_id: "channel-1", amount: 75000 }],
      };
      await run(dto, mockTx);
      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      expect(createArgs.subtotal.toNumber()).toBe(75000);
    });
  });

  describe("modifier", () => {
    const requiredGroupAttached = [
      {
        item_id: "item-1",
        modifier_group_id: "grp-1",
        modifier_group: { id: "grp-1", name: "Level Pedas", is_required: true, min_select: 1, max_select: 1 },
      },
    ];

    it("menolak jika grup modifier wajib tidak dipilih sama sekali", async () => {
      const mockTx = buildMockTx({
        itemModifierGroup: { findMany: jest.fn().mockResolvedValue(requiredGroupAttached) },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-1", quantity: 1 }],
        payments: [{ payment_channel_id: "channel-1", amount: 20000 }],
      };
      await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
    });

    it("menolak modifier yang bukan dari grup yang terpasang di item ini", async () => {
      const mockTx = buildMockTx({
        itemModifierGroup: { findMany: jest.fn().mockResolvedValue([]) }, // tidak ada grup terpasang
        modifier: {
          findMany: jest.fn().mockResolvedValue([
            { id: "mod-1", modifier_group_id: "grp-asing", name: "Extra Pedas", price_adjustment: new Prisma.Decimal(2000), ingredient_item_id: null, ingredient_qty: null },
          ]),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-1", quantity: 1, modifier_ids: ["mod-1"] }],
        payments: [{ payment_channel_id: "channel-1", amount: 22000 }],
      };
      await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
    });

    it("menolak jika pilihan melebihi max_select grup", async () => {
      const mockTx = buildMockTx({
        itemModifierGroup: {
          findMany: jest.fn().mockResolvedValue([
            {
              item_id: "item-1",
              modifier_group_id: "grp-1",
              modifier_group: { id: "grp-1", name: "Topping", is_required: false, min_select: 0, max_select: 1 },
            },
          ]),
        },
        modifier: {
          findMany: jest.fn().mockResolvedValue([
            { id: "mod-1", modifier_group_id: "grp-1", name: "Keju", price_adjustment: new Prisma.Decimal(3000), ingredient_item_id: null, ingredient_qty: null },
            { id: "mod-2", modifier_group_id: "grp-1", name: "Sosis", price_adjustment: new Prisma.Decimal(4000), ingredient_item_id: null, ingredient_qty: null },
          ]),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-1", quantity: 1, modifier_ids: ["mod-1", "mod-2"] }],
        payments: [{ payment_channel_id: "channel-1", amount: 27000 }],
      };
      await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
    });

    it("menambahkan price_adjustment modifier ke unit_price & subtotal", async () => {
      const mockTx = buildMockTx({
        itemModifierGroup: {
          findMany: jest.fn().mockResolvedValue([
            {
              item_id: "item-1",
              modifier_group_id: "grp-1",
              modifier_group: { id: "grp-1", name: "Topping", is_required: false, min_select: 0, max_select: 2 },
            },
          ]),
        },
        modifier: {
          findMany: jest.fn().mockResolvedValue([
            { id: "mod-1", modifier_group_id: "grp-1", name: "Keju", price_adjustment: new Prisma.Decimal(3000), ingredient_item_id: null, ingredient_qty: null },
          ]),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-1", quantity: 1, modifier_ids: ["mod-1"] }],
        payments: [{ payment_channel_id: "channel-1", amount: 23000 }],
      };
      await run(dto, mockTx);
      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      expect(createArgs.subtotal.toNumber()).toBe(23000); // 20000 base + 3000 modifier
      expect(mockTx.transactionItemModifier.create).toHaveBeenCalledWith({
        data: {
          transaction_item_id: "txn-item-1",
          modifier_id: "mod-1",
          modifier_name_snapshot: "Keju",
          price_adjustment_snapshot: expect.objectContaining({}),
        },
      });
    });

    it("mengurangi stok bahan modifier (ingredient_item_id) independen dari stok item", async () => {
      const mockTx = buildMockTx({
        itemModifierGroup: {
          findMany: jest.fn().mockResolvedValue([
            {
              item_id: "item-1",
              modifier_group_id: "grp-1",
              modifier_group: { id: "grp-1", name: "Topping", is_required: false, min_select: 0, max_select: 2 },
            },
          ]),
        },
        modifier: {
          findMany: jest.fn().mockResolvedValue([
            { id: "mod-1", modifier_group_id: "grp-1", name: "Keju", price_adjustment: new Prisma.Decimal(3000), ingredient_item_id: "ing-1", ingredient_qty: new Prisma.Decimal(1) },
          ]),
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
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "ing-1", name: "Keju" }),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-1", quantity: 1, modifier_ids: ["mod-1"] }],
        payments: [{ payment_channel_id: "channel-1", amount: 23000 }],
      };
      await run(dto, mockTx);
      // 1x untuk stok item Nasi Goreng sendiri, 1x untuk bahan modifier Keju
      expect(mockTx.inventory.update).toHaveBeenCalledTimes(2);
      expect(mockTx.stockMovement.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("harga tier grosir", () => {
    it("memakai harga tier langsung (bukan tambahan) saat quantity cocok", async () => {
      const mockTx = buildMockTx({
        priceTier: {
          findFirst: jest.fn().mockResolvedValue({ id: "tier-1", price: new Prisma.Decimal(17000) }),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-1", quantity: 12 }],
        payments: [{ payment_channel_id: "channel-1", amount: 204000 }],
      };
      await run(dto, mockTx);
      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      expect(createArgs.subtotal.toNumber()).toBe(204000); // 17000 * 12, bukan 20000 (base_price) * 12
    });

    it("jatuh ke base_price kalau tidak ada tier yang cocok", async () => {
      const mockTx = buildMockTx(); // priceTier.findFirst default resolve null
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-1", quantity: 1 }],
        payments: [{ payment_channel_id: "channel-1", amount: 20000 }],
      };
      await run(dto, mockTx);
      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      expect(createArgs.subtotal.toNumber()).toBe(20000);
    });
  });

  describe("diskon otomatis & voucher", () => {
    it("diskon all_items percentage memotong subtotal, pajak dihitung dari subtotal SETELAH diskon", async () => {
      const mockTx = buildMockTx({
        discount: {
          findMany: jest.fn().mockResolvedValue([
            { id: "disc-1", name: "Promo 10%", discount_type: "percentage", value: new Prisma.Decimal(10), scope: "all_items", conditions: {}, end_date: null },
          ]),
        },
        tax: {
          findMany: jest.fn().mockResolvedValue([
            { id: "tax-1", name: "PPN 10%", rate: new Prisma.Decimal(10), tax_kind: "tax" },
          ]),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-1", quantity: 1 }],
        payments: [{ payment_channel_id: "channel-1", amount: 19800 }],
      };
      await run(dto, mockTx);
      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      expect(createArgs.subtotal.toNumber()).toBe(20000);
      expect(createArgs.discount_total.toNumber()).toBe(2000); // 10% x 20000
      expect(createArgs.tax_total.toNumber()).toBe(1800); // 10% x (20000-2000), bukan 10% x 20000
      expect(createArgs.total.toNumber()).toBe(19800);
      expect(mockTx.transactionDiscount.create).toHaveBeenCalledWith({
        data: { transaction_id: "txn-1", discount_id: "disc-1", discount_name_snapshot: "Promo 10%", amount_applied: expect.objectContaining({}) },
      });
    });

    it("diskon scope specific_items tidak berlaku untuk item di luar daftar", async () => {
      const mockTx = buildMockTx({
        discount: {
          findMany: jest.fn().mockResolvedValue([
            { id: "disc-1", name: "Promo Item Lain", discount_type: "percentage", value: new Prisma.Decimal(50), scope: "specific_items", conditions: { item_ids: ["item-lain"] }, end_date: null },
          ]),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-1", quantity: 1 }],
        payments: [{ payment_channel_id: "channel-1", amount: 20000 }],
      };
      await run(dto, mockTx);
      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      expect(createArgs.discount_total.toNumber()).toBe(0);
      expect(createArgs.subtotal.toNumber()).toBe(20000);
      expect(createArgs.total.toNumber()).toBe(20000);
    });

    it("diskon fixed_amount dibatasi tidak melebihi subtotal", async () => {
      const mockTx = buildMockTx({
        discount: {
          findMany: jest.fn().mockResolvedValue([
            { id: "disc-1", name: "Potongan Besar", discount_type: "fixed_amount", value: new Prisma.Decimal(50000), scope: "all_items", conditions: {}, end_date: null },
          ]),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-1", quantity: 1 }],
        payments: [{ payment_channel_id: "channel-1", amount: 1 }],
      };
      await run(dto, mockTx);
      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      expect(createArgs.discount_total.toNumber()).toBe(20000); // dibatasi, bukan 50000
      expect(createArgs.total.toNumber()).toBe(0);
    });

    it("menolak voucher dengan kode yang tidak ditemukan", async () => {
      const mockTx = buildMockTx({ voucher: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        voucher_code: "TIDAKADA",
        items: [{ item_id: "item-1", quantity: 1 }],
        payments: [{ payment_channel_id: "channel-1", amount: 20000 }],
      };
      await expect(run(dto, mockTx)).rejects.toThrow(NotFoundException);
    });

    it("menolak voucher yang sudah mencapai batas pemakaian", async () => {
      const mockTx = buildMockTx({
        voucher: {
          findUnique: jest.fn().mockResolvedValue({
            id: "v-1", is_active: true, start_date: null, end_date: null, usage_limit: 5, usage_count: 5,
            min_purchase: new Prisma.Decimal(0), per_customer_limit: 1, discount_type: "fixed_amount", value: new Prisma.Decimal(5000), max_discount: null,
          }),
          update: jest.fn(),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        voucher_code: "HABIS",
        items: [{ item_id: "item-1", quantity: 1 }],
        payments: [{ payment_channel_id: "channel-1", amount: 20000 }],
      };
      await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
    });

    it("menolak voucher jika subtotal belum mencapai min_purchase", async () => {
      const mockTx = buildMockTx({
        voucher: {
          findUnique: jest.fn().mockResolvedValue({
            id: "v-1", is_active: true, start_date: null, end_date: null, usage_limit: null, usage_count: 0,
            min_purchase: new Prisma.Decimal(50000), per_customer_limit: 1, discount_type: "fixed_amount", value: new Prisma.Decimal(5000), max_discount: null,
          }),
          update: jest.fn(),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        voucher_code: "MINBELANJA",
        items: [{ item_id: "item-1", quantity: 1 }],
        payments: [{ payment_channel_id: "channel-1", amount: 20000 }],
      };
      await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
    });

    it("voucher percentage dibatasi oleh max_discount", async () => {
      const mockTx = buildMockTx({
        voucher: {
          findUnique: jest.fn().mockResolvedValue({
            id: "v-1", is_active: true, start_date: null, end_date: null, usage_limit: null, usage_count: 0,
            min_purchase: new Prisma.Decimal(0), per_customer_limit: 1, discount_type: "percentage", value: new Prisma.Decimal(50), max_discount: new Prisma.Decimal(3000),
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        voucher_code: "hemat50",
        items: [{ item_id: "item-1", quantity: 1 }],
        payments: [{ payment_channel_id: "channel-1", amount: 17000 }],
      };
      await run(dto, mockTx);
      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      expect(createArgs.discount_total.toNumber()).toBe(3000); // 50% x 20000 = 10000, dibatasi max_discount 3000
      expect(mockTx.voucher.update).toHaveBeenCalledWith({
        where: { id: "v-1" },
        data: { usage_count: { increment: 1 } },
      });
      expect(mockTx.voucherRedemption.create).toHaveBeenCalled();
    });

    it("diskon otomatis dan voucher ditumpuk berurutan (voucher dari sisa setelah diskon otomatis)", async () => {
      const mockTx = buildMockTx({
        discount: {
          findMany: jest.fn().mockResolvedValue([
            { id: "disc-1", name: "Promo 10%", discount_type: "percentage", value: new Prisma.Decimal(10), scope: "all_items", conditions: {}, end_date: null },
          ]),
        },
        voucher: {
          findUnique: jest.fn().mockResolvedValue({
            id: "v-1", is_active: true, start_date: null, end_date: null, usage_limit: null, usage_count: 0,
            min_purchase: new Prisma.Decimal(0), per_customer_limit: 1, discount_type: "fixed_amount", value: new Prisma.Decimal(5000), max_discount: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        voucher_code: "TUMPUK",
        items: [{ item_id: "item-1", quantity: 1 }],
        payments: [{ payment_channel_id: "channel-1", amount: 13000 }],
      };
      await run(dto, mockTx);
      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      // 20000 - 2000 (diskon 10%) - 5000 (voucher fixed) = 13000
      expect(createArgs.discount_total.toNumber()).toBe(7000);
      expect(createArgs.total.toNumber()).toBe(13000);
    });
  });

  describe("openBill", () => {
    async function runOpen(dto: Parameters<SalesService["openBill"]>[2], mockTx: ReturnType<typeof buildMockTx>) {
      prisma.$transaction.mockImplementation((fn: any) => fn(mockTx));
      return service.openBill("biz-1", "cashier-1", dto);
    }

    it("menolak jika meja tidak ditemukan", async () => {
      const mockTx = buildMockTx({ $queryRaw: jest.fn().mockResolvedValue([]) });
      await expect(runOpen({ outlet_id: "outlet-1", dining_table_id: "table-1" }, mockTx)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("menolak jika meja sedang occupied (bill lain masih terbuka)", async () => {
      const mockTx = buildMockTx({
        $queryRaw: jest.fn().mockResolvedValue([{ id: "table-1", status: "occupied" }]),
      });
      await expect(runOpen({ outlet_id: "outlet-1", dining_table_id: "table-1" }, mockTx)).rejects.toThrow(
        ConflictException,
      );
    });

    it("membuka bill status='open' dan menandai meja occupied", async () => {
      const mockTx = buildMockTx({
        $queryRaw: jest.fn().mockResolvedValue([{ id: "table-1", status: "available" }]),
      });
      await runOpen({ outlet_id: "outlet-1", dining_table_id: "table-1" }, mockTx);

      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      expect(createArgs.status).toBe("open");
      expect(mockTx.diningTable.update).toHaveBeenCalledWith({
        where: { id: "table-1" },
        data: { status: "occupied" },
      });
      // openBill tidak memproses pembayaran — tidak ada baris payment/kasbon
      expect(mockTx.payment.create).not.toHaveBeenCalled();
    });

    it("bisa dibuka tanpa item awal (pesanan menyusul lewat addBillItems)", async () => {
      const mockTx = buildMockTx();
      await runOpen({ outlet_id: "outlet-1" }, mockTx);

      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      expect(createArgs.subtotal.toNumber()).toBe(0);
      expect(createArgs.total.toNumber()).toBe(0);
      expect(mockTx.transactionItem.create).not.toHaveBeenCalled();
    });
  });

  describe("addBillItems", () => {
    async function runAdd(
      transactionId: string,
      dto: Parameters<SalesService["addBillItems"]>[3],
      mockTx: ReturnType<typeof buildMockTx>,
    ) {
      prisma.$transaction.mockImplementation((fn: any) => fn(mockTx));
      return service.addBillItems("biz-1", "user-1", transactionId, dto);
    }

    it("menolak jika transaksi tidak ditemukan", async () => {
      const mockTx = buildMockTx({ $queryRaw: jest.fn().mockResolvedValue([]) });
      await expect(runAdd("txn-1", { items: [{ item_id: "item-1", quantity: 1 }] }, mockTx)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("menolak jika bill sudah tidak berstatus open", async () => {
      const mockTx = buildMockTx({
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            { id: "txn-1", status: "completed", outlet_id: "outlet-1", subtotal: new Prisma.Decimal(0), total_cost: new Prisma.Decimal(0) },
          ]),
      });
      await expect(runAdd("txn-1", { items: [{ item_id: "item-1", quantity: 1 }] }, mockTx)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("mengakumulasi subtotal & total_cost lama dengan item baru, menghitung ulang pajak dari total kumulatif", async () => {
      const lockRow = {
        id: "txn-1",
        status: "open",
        outlet_id: "outlet-1",
        subtotal: new Prisma.Decimal(20000),
        total_cost: new Prisma.Decimal(11000),
      };
      const mockTx = buildMockTx({
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([lockRow]) // kunci baris transaksi
          .mockResolvedValueOnce([{ id: "inv-1", quantity_on_hand: new Prisma.Decimal(50) }]), // kunci inventory
        transaction: {
          create: jest.fn(),
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "txn-1", items: [], payments: [], taxes: [], ...data })),
          findUniqueOrThrow: jest.fn(),
        },
      });

      const result = await runAdd("txn-1", { items: [{ item_id: "item-1", quantity: 1 }] }, mockTx);

      expect(mockTx.transactionTax.deleteMany).toHaveBeenCalledWith({ where: { transaction_id: "txn-1" } });
      const updateArgs = mockTx.transaction.update.mock.calls[0][0].data;
      expect(updateArgs.subtotal.toNumber()).toBe(40000); // 20000 lama + 20000 item baru
      expect(updateArgs.total_cost.toNumber()).toBe(22000); // 11000 lama + 11000 baru
      expect(result.subtotal.toNumber()).toBe(40000);
    });
  });

  describe("closeBill", () => {
    async function runClose(
      transactionId: string,
      dto: Parameters<SalesService["closeBill"]>[3],
      mockTx: ReturnType<typeof buildMockTx>,
    ) {
      prisma.$transaction.mockImplementation((fn: any) => fn(mockTx));
      return service.closeBill("biz-1", "user-1", transactionId, dto);
    }

    it("menolak jika bill tidak ditemukan", async () => {
      const mockTx = buildMockTx({ $queryRaw: jest.fn().mockResolvedValue([]) });
      await expect(
        runClose("txn-1", { payments: [{ payment_channel_id: "channel-1", amount: 20000 }] }, mockTx),
      ).rejects.toThrow(NotFoundException);
    });

    it("menolak jika bill sudah tidak berstatus open", async () => {
      const mockTx = buildMockTx({
        $queryRaw: jest.fn().mockResolvedValue([
          { id: "txn-1", status: "completed", subtotal: new Prisma.Decimal(20000), delivery_fee: new Prisma.Decimal(0), total: new Prisma.Decimal(20000), customer_id: null, dining_table_id: null },
        ]),
      });
      await expect(
        runClose("txn-1", { payments: [{ payment_channel_id: "channel-1", amount: 20000 }] }, mockTx),
      ).rejects.toThrow(BadRequestException);
    });

    it("menolak jika pembayaran kurang dari total bill", async () => {
      const mockTx = buildMockTx({
        $queryRaw: jest.fn().mockResolvedValue([
          { id: "txn-1", status: "open", subtotal: new Prisma.Decimal(20000), delivery_fee: new Prisma.Decimal(0), total: new Prisma.Decimal(20000), customer_id: null, dining_table_id: null },
        ]),
      });
      await expect(
        runClose("txn-1", { payments: [{ payment_channel_id: "channel-1", amount: 5000 }] }, mockTx),
      ).rejects.toThrow(BadRequestException);
    });

    it("menutup bill (status completed) dan membebaskan meja", async () => {
      const mockTx = buildMockTx({
        $queryRaw: jest.fn().mockResolvedValue([
          { id: "txn-1", status: "open", subtotal: new Prisma.Decimal(20000), delivery_fee: new Prisma.Decimal(0), total: new Prisma.Decimal(20000), customer_id: null, dining_table_id: "table-1" },
        ]),
      });

      await runClose("txn-1", { payments: [{ payment_channel_id: "channel-1", amount: 20000 }] }, mockTx);

      // Panggilan update terakhir adalah dari finalizePayment (status/amount_paid);
      // panggilan sebelumnya adalah update diskon/pajak/total oleh closeBill sendiri.
      const lastUpdateCall = mockTx.transaction.update.mock.calls[mockTx.transaction.update.mock.calls.length - 1];
      const updateArgs = lastUpdateCall[0].data;
      expect(updateArgs.status).toBe("completed");
      expect(updateArgs.amount_paid.toNumber()).toBe(20000);
      expect(mockTx.diningTable.update).toHaveBeenCalledWith({
        where: { id: "table-1" },
        data: { status: "available" },
      });
      expect(mockTx.payment.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("aturan pembayaran (kembalian hanya dari tunai)", () => {
    const cashChannel = {
      id: "channel-1", business_id: "biz-1", name: "Tunai", channel_type: "cash",
      fee_percentage: new Prisma.Decimal(0), fee_fixed: new Prisma.Decimal(0), is_active: true,
    };
    const qrisChannel = {
      id: "channel-qris", business_id: "biz-1", name: "QRIS", channel_type: "qris",
      fee_percentage: new Prisma.Decimal(0.7), fee_fixed: new Prisma.Decimal(0), is_active: true,
    };
    const channelsMock = () => ({
      findFirst: jest
        .fn()
        .mockImplementation(({ where }) => Promise.resolve(where.id === "channel-qris" ? qrisChannel : cashChannel)),
    });
    const kasbonMockTx = () =>
      buildMockTx({
        paymentChannel: channelsMock(),
        businessSetting: {
          findFirst: jest.fn().mockResolvedValue({ rounding: "none", enable_kasbon: true, enable_loyalty: false }),
        },
        customer: {
          findFirst: jest.fn().mockResolvedValue({ id: "cust-1", credit_limit: new Prisma.Decimal(100000) }),
          update: jest.fn().mockResolvedValue({}),
        },
      });

    it("tunai lebih bayar → kembalian dicatat", async () => {
      const mockTx = buildMockTx();
      await run({ ...baseDto, payments: [{ payment_channel_id: "channel-1", amount: 50000 }] }, mockTx);
      const updateArgs = mockTx.transaction.update.mock.calls[0][0].data;
      expect(updateArgs.amount_paid.toNumber()).toBe(50000);
      expect(updateArgs.change_due.toNumber()).toBe(30000);
    });

    it("menolak QRIS yang melebihi total (non-tunai tidak bisa memberi kembalian)", async () => {
      const mockTx = buildMockTx({ paymentChannel: channelsMock() });
      const dto: CreateTransactionDto = { ...baseDto, payments: [{ payment_channel_id: "channel-qris", amount: 25000 }] };
      await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
      expect(mockTx.payment.create).not.toHaveBeenCalled();
    });

    it("split QRIS + tunai: kembalian hanya dari porsi tunai", async () => {
      const mockTx = buildMockTx({ paymentChannel: channelsMock() });
      const dto: CreateTransactionDto = {
        ...baseDto,
        payments: [
          { payment_channel_id: "channel-qris", amount: 15000 },
          { payment_channel_id: "channel-1", amount: 10000 },
        ],
      };
      await run(dto, mockTx);
      const updateArgs = mockTx.transaction.update.mock.calls[0][0].data;
      expect(updateArgs.amount_paid.toNumber()).toBe(25000);
      expect(updateArgs.change_due.toNumber()).toBe(5000);
      expect(mockTx.payment.create).toHaveBeenCalledTimes(2);
    });

    it("menolak kasbon yang menghasilkan kembalian (kasbon jadi pinjaman tunai)", async () => {
      const mockTx = kasbonMockTx();
      const dto: CreateTransactionDto = {
        ...baseDto,
        customer_id: "cust-1",
        payments: [
          { payment_channel_id: "channel-1", amount: 10000 },
          { payment_channel_id: "channel-1", amount: 15000, is_receivable: true },
        ],
      };
      await expect(run(dto, mockTx)).rejects.toThrow(BadRequestException);
      expect(mockTx.customerReceivable.create).not.toHaveBeenCalled();
    });

    it("kasbon pas sebesar sisa tagihan diterima, baris pelanggan dikunci", async () => {
      const mockTx = kasbonMockTx();
      const dto: CreateTransactionDto = {
        ...baseDto,
        customer_id: "cust-1",
        payments: [
          { payment_channel_id: "channel-1", amount: 5000 },
          { payment_channel_id: "channel-1", amount: 15000, is_receivable: true },
        ],
      };
      await run(dto, mockTx);
      const customerLocks = rawCallsMatching(mockTx.$queryRaw, "FROM customers");
      expect(customerLocks).toHaveLength(1);
      expect(rawSql(customerLocks[0][0] as string[])).toContain("FOR NO KEY UPDATE");
      expect(mockTx.customerReceivable.create.mock.calls[0][0].data.amount.toNumber()).toBe(15000);
      const updateArgs = mockTx.transaction.update.mock.calls[0][0].data;
      expect(updateArgs.amount_paid.toNumber()).toBe(5000);
      expect(updateArgs.change_due.toNumber()).toBe(0);
    });
  });

  describe("zona waktu usaha", () => {
    // 20 Okt 2026 18:30 UTC = Rabu 21 Okt 01:30 WIB — jam server (UTC) masih Selasa 20 Okt.
    beforeEach(() => {
      jest.useFakeTimers({
        now: new Date("2026-10-20T18:30:00Z"),
        doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
      });
    });
    afterEach(() => jest.useRealTimers());

    it("nomor struk & counter harian memakai tanggal lokal usaha", async () => {
      const mockTx = buildMockTx();
      await run(baseDto, mockTx);
      const upsertWhere = mockTx.documentCounter.upsert.mock.calls[0][0].where.business_id_outlet_id_doc_type_period;
      expect(upsertWhere.period.toISOString()).toBe("2026-10-21T00:00:00.000Z");
      expect(mockTx.transaction.create.mock.calls[0][0].data.transaction_number).toBe("INV-OUTLET-20261021-0001");
    });

    it("usaha di WITA memakai tanggal WITA", async () => {
      jest.setSystemTime(new Date("2026-10-20T16:30:00Z")); // 23:30 WIB = 00:30 WITA
      const mockTx = buildMockTx({
        business: { findUnique: jest.fn().mockResolvedValue({ timezone: "Asia/Makassar" }) },
      });
      await run(baseDto, mockTx);
      expect(mockTx.transaction.create.mock.calls[0][0].data.transaction_number).toBe("INV-OUTLET-20261021-0001");
    });

    it("zona waktu tidak valid di data usaha jatuh ke Asia/Jakarta (tidak memblokir penjualan)", async () => {
      const mockTx = buildMockTx({ business: { findUnique: jest.fn().mockResolvedValue({ timezone: "WIB" }) } });
      await run(baseDto, mockTx);
      expect(mockTx.transaction.create.mock.calls[0][0].data.transaction_number).toBe("INV-OUTLET-20261021-0001");
    });

    it("jadwal promo (hari & jam) dibaca dalam jam dinding usaha", async () => {
      // Usaha di Makassar: 16:30 UTC = Selasa 23:30 WIB/UTC+7 server = Rabu 00:30 WITA.
      jest.setSystemTime(new Date("2026-10-20T16:30:00Z"));
      const mockTx = buildMockTx({
        business: { findUnique: jest.fn().mockResolvedValue({ timezone: "Asia/Makassar" }) },
        discount: {
          findMany: jest.fn().mockResolvedValue([
            { id: "disc-rabu", name: "Promo Rabu Dini Hari", discount_type: "percentage", value: new Prisma.Decimal(10), scope: "all_items", conditions: { days_of_week: [3], hour_start: "00:00", hour_end: "02:00" }, end_date: null },
            { id: "disc-selasa", name: "Promo Selasa", discount_type: "percentage", value: new Prisma.Decimal(50), scope: "all_items", conditions: { days_of_week: [2] }, end_date: null },
          ]),
        },
      });
      await run({ ...baseDto, payments: [{ payment_channel_id: "channel-1", amount: 18000 }] }, mockTx);
      // Hanya promo Rabu (WITA) yang berlaku, bukan promo Selasa (hari menurut jam server).
      expect(mockTx.transaction.create.mock.calls[0][0].data.discount_total.toNumber()).toBe(2000);
      expect(mockTx.transactionDiscount.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("pembulatan ke rupiah", () => {
    const itemWithPrice = (name: string, price: number) => ({
      findFirst: jest.fn().mockResolvedValue({
        id: "item-1", business_id: "biz-1", name, item_type: "product", track_stock: true, use_recipe: false,
        base_price: new Prisma.Decimal(price), cost_price: new Prisma.Decimal(0),
      }),
      findUniqueOrThrow: jest.fn(),
    });

    it("pajak dibulatkan per komponen → total = jumlah angka di struk = pratinjau kasir", async () => {
      const mockTx = buildMockTx({
        item: itemWithPrice("Kopi", 15230),
        tax: { findMany: jest.fn().mockResolvedValue([{ id: "tax-1", name: "PB1 11%", rate: new Prisma.Decimal(11), tax_kind: "tax" }]) },
      });
      // 11% x 15.230 = 1.675,3 → 1.675; total 16.905 — bayar pas tidak ditolak
      await run({ ...baseDto, payments: [{ payment_channel_id: "channel-1", amount: 16905 }] }, mockTx);
      const createArgs = mockTx.transaction.create.mock.calls[0][0].data;
      expect(createArgs.tax_total.toNumber()).toBe(1675);
      expect(createArgs.total.toNumber()).toBe(16905);
    });

    it("subtotal baris dengan kuantitas desimal (kg) dibulatkan ke rupiah", async () => {
      const mockTx = buildMockTx({ item: itemWithPrice("Daging per kg", 12500) });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [{ item_id: "item-1", quantity: 0.333 }],
        payments: [{ payment_channel_id: "channel-1", amount: 4163 }],
      };
      await run(dto, mockTx); // 12.500 x 0,333 = 4.162,5 → 4.163
      expect(mockTx.transaction.create.mock.calls[0][0].data.subtotal.toNumber()).toBe(4163);
      expect(mockTx.transactionItem.create.mock.calls[0][0].data.subtotal.toNumber()).toBe(4163);
    });
  });

  describe("pengurangan stok", () => {
    const recipeItem = {
      id: "item-1", business_id: "biz-1", name: "Es Teh", item_type: "product", track_stock: false, use_recipe: true,
      base_price: new Prisma.Decimal(20000), cost_price: new Prisma.Decimal(3000),
    };

    it("resep: item tanpa varian hanya memakai resep umum (variant_id NULL)", async () => {
      const mockTx = buildMockTx({
        item: { findFirst: jest.fn().mockResolvedValue(recipeItem), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "ing-teh", name: "Teh" }) },
        recipe: { findMany: jest.fn().mockResolvedValue([{ ingredient_item_id: "ing-teh", quantity_used: new Prisma.Decimal(5) }]) },
      });
      await run(baseDto, mockTx);
      expect(mockTx.recipe.findMany).toHaveBeenCalledWith({ where: { item_id: "item-1", OR: [{ variant_id: null }] } });
      expect(mockTx.stockMovement.create.mock.calls[0][0].data.movement_type).toBe("recipe_out");
    });

    it("resep: item dengan varian memakai resep umum + resep varian itu saja", async () => {
      const mockTx = buildMockTx({
        item: { findFirst: jest.fn().mockResolvedValue(recipeItem), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "ing-teh", name: "Teh" }) },
        itemVariant: {
          findFirst: jest.fn().mockResolvedValue({ id: "var-large", name: "Large", price_adjustment: new Prisma.Decimal(0), cost_adjustment: new Prisma.Decimal(0) }),
        },
        recipe: { findMany: jest.fn().mockResolvedValue([]) },
      });
      await run({ ...baseDto, items: [{ item_id: "item-1", variant_id: "var-large", quantity: 1 }] }, mockTx);
      expect(mockTx.recipe.findMany).toHaveBeenCalledWith({
        where: { item_id: "item-1", OR: [{ variant_id: null }, { variant_id: "var-large" }] },
      });
    });

    it("kunci inventory diambil berurutan (item_id), bukan urutan keranjang — cegah deadlock", async () => {
      const mockTx = buildMockTx({
        item: {
          findFirst: jest.fn().mockImplementation(({ where }) =>
            Promise.resolve({
              id: where.id, business_id: "biz-1", name: `Item ${where.id}`, item_type: "product", track_stock: true,
              use_recipe: false, base_price: new Prisma.Decimal(10000), cost_price: new Prisma.Decimal(5000),
            }),
          ),
          findUniqueOrThrow: jest.fn(),
        },
      });
      const dto: CreateTransactionDto = {
        outlet_id: "outlet-1",
        items: [
          { item_id: "item-b", quantity: 1 },
          { item_id: "item-a", quantity: 1 },
        ],
        payments: [{ payment_channel_id: "channel-1", amount: 20000 }],
      };
      await run(dto, mockTx);
      // $queryRaw`... ${outletId} ... ${item_id} ... ${variant_id}` → argumen ke-2 = item_id
      expect(rawCallsMatching(mockTx.$queryRaw, "FROM inventory").map((c) => c[2])).toEqual(["item-a", "item-b"]);
      // baris struk tetap mengikuti urutan keranjang
      expect(mockTx.transactionItem.create.mock.calls.map((c: any[]) => c[0].data.item_id)).toEqual(["item-b", "item-a"]);
    });
  });

  describe("voucher — penguncian", () => {
    it("baris voucher dikunci sebelum batas pemakaian dicek", async () => {
      const mockTx = buildMockTx({
        voucher: {
          findUnique: jest.fn().mockResolvedValue({
            id: "v-1", is_active: true, start_date: null, end_date: null, usage_limit: 10, usage_count: 0,
            min_purchase: new Prisma.Decimal(0), per_customer_limit: 1, discount_type: "fixed_amount", value: new Prisma.Decimal(5000), max_discount: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      });
      await run({ ...baseDto, voucher_code: "hemat", payments: [{ payment_channel_id: "channel-1", amount: 15000 }] }, mockTx);
      const voucherCallIndex = mockTx.$queryRaw.mock.calls.findIndex((c: any[]) => rawSql(c[0]).includes("FROM vouchers"));
      expect(voucherCallIndex).toBeGreaterThanOrEqual(0);
      const [strings, ...values] = mockTx.$queryRaw.mock.calls[voucherCallIndex];
      expect(rawSql(strings)).toContain("FOR NO KEY UPDATE");
      expect(values).toEqual(["biz-1", "HEMAT"]);
      expect(mockTx.$queryRaw.mock.invocationCallOrder[voucherCallIndex]).toBeLessThan(
        mockTx.voucher.findUnique.mock.invocationCallOrder[0],
      );
    });
  });

  describe("idempotency (client_ref)", () => {
    const CLIENT_REF = "8b1f6a2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b";
    const existingTxn = { id: "txn-lama", outlet_id: "outlet-1", items: [], payments: [], taxes: [] };

    it("client_ref yang sudah tersimpan → kembalikan transaksi lama tanpa membuat yang baru", async () => {
      (prisma as any).transaction = { findUnique: jest.fn().mockResolvedValue(existingTxn) };
      const result = await service.createTransaction("biz-1", "cashier-1", { ...baseDto, client_ref: CLIENT_REF });
      expect(result.id).toBe("txn-lama");
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect((prisma as any).transaction.findUnique).toHaveBeenCalledWith({
        where: { business_id_client_ref: { business_id: "biz-1", client_ref: CLIENT_REF } },
        include: expect.any(Object),
      });
    });

    it("dua request kembar balapan: yang kalah kena unique violation → dapat transaksi pemenang", async () => {
      (prisma as any).transaction = {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existingTxn),
      };
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
      );
      const result = await service.createTransaction("biz-1", "cashier-1", { ...baseDto, client_ref: CLIENT_REF });
      expect(result.id).toBe("txn-lama");
    });

    it("error lain tetap dilempar walau ada client_ref", async () => {
      (prisma as any).transaction = { findUnique: jest.fn().mockResolvedValue(null) };
      const mockTx = buildMockTx({ item: { findFirst: jest.fn().mockResolvedValue(null), findUniqueOrThrow: jest.fn() } });
      await expect(run({ ...baseDto, client_ref: CLIENT_REF }, mockTx)).rejects.toThrow(NotFoundException);
    });

    it("client_ref milik transaksi di outlet lain → 409", async () => {
      (prisma as any).transaction = { findUnique: jest.fn().mockResolvedValue({ ...existingTxn, outlet_id: "outlet-lain" }) };
      await expect(
        service.createTransaction("biz-1", "cashier-1", { ...baseDto, client_ref: CLIENT_REF }),
      ).rejects.toThrow(ConflictException);
    });

    it("client_ref ikut disimpan di baris transaksi", async () => {
      (prisma as any).transaction = { findUnique: jest.fn().mockResolvedValue(null) };
      const mockTx = buildMockTx();
      await run({ ...baseDto, client_ref: CLIENT_REF }, mockTx);
      expect(mockTx.transaction.create.mock.calls[0][0].data.client_ref).toBe(CLIENT_REF);
    });
  });

  describe("quote (pratinjau tanpa menyimpan)", () => {
    it("menghitung total final (diskon otomatis + voucher + pajak) tanpa menulis & tanpa mengunci", async () => {
      Object.assign(
        prisma,
        buildMockTx({
          discount: {
            findMany: jest.fn().mockResolvedValue([
              { id: "disc-1", name: "Promo 10%", discount_type: "percentage", value: new Prisma.Decimal(10), scope: "all_items", conditions: {}, end_date: null },
            ]),
          },
          tax: { findMany: jest.fn().mockResolvedValue([{ id: "tax-1", name: "PPN 10%", rate: new Prisma.Decimal(10), tax_kind: "tax" }]) },
          voucher: {
            findUnique: jest.fn().mockResolvedValue({
              id: "v-1", is_active: true, start_date: null, end_date: null, usage_limit: null, usage_count: 0,
              min_purchase: new Prisma.Decimal(0), per_customer_limit: 1, discount_type: "fixed_amount", value: new Prisma.Decimal(3000), max_discount: null,
            }),
            update: jest.fn(),
          },
        }),
      );
      const quote = await service.quoteTransaction("biz-1", {
        outlet_id: "outlet-1",
        voucher_code: "potong3k",
        items: [{ item_id: "item-1", quantity: 1 }],
      });
      // 20.000 − 2.000 (promo 10%) − 3.000 (voucher) = 15.000; pajak 10% = 1.500
      expect(quote.discount_total.toNumber()).toBe(5000);
      expect(quote.discounts).toEqual([{ name: "Promo 10%", amount: expect.objectContaining({}) }]);
      expect(quote.voucher?.code).toBe("POTONG3K");
      expect(quote.tax_total.toNumber()).toBe(1500);
      expect(quote.total.toNumber()).toBe(16500);
      const db = prisma as any;
      expect(db.transaction.create).not.toHaveBeenCalled();
      expect(db.voucher.update).not.toHaveBeenCalled();
      expect(db.inventory.update).not.toHaveBeenCalled();
      expect(db.$queryRaw).not.toHaveBeenCalled();
    });

    it("quoteBill menolak bill yang sudah ditutup", async () => {
      Object.assign(prisma, buildMockTx({ transaction: { findFirst: jest.fn().mockResolvedValue({ id: "txn-1", status: "completed" }) } }));
      await expect(service.quoteBill("biz-1", "txn-1", {})).rejects.toThrow(BadRequestException);
    });

    it("quoteBill mengevaluasi diskon atas item bill yang tersimpan", async () => {
      Object.assign(
        prisma,
        buildMockTx({
          transaction: {
            findFirst: jest.fn().mockResolvedValue({
              id: "txn-1", status: "open", subtotal: new Prisma.Decimal(40000), delivery_fee: new Prisma.Decimal(0), customer_id: null,
            }),
          },
          transactionItem: {
            findMany: jest.fn().mockResolvedValue([{ item_id: "item-1", subtotal: new Prisma.Decimal(40000), item: { category_id: "cat-1" } }]),
          },
          discount: {
            findMany: jest.fn().mockResolvedValue([
              { id: "disc-1", name: "Promo Kategori", discount_type: "percentage", value: new Prisma.Decimal(25), scope: "category", conditions: { category_ids: ["cat-1"] }, end_date: null },
            ]),
          },
        }),
      );
      const quote = await service.quoteBill("biz-1", "txn-1", {});
      expect(quote.discount_total.toNumber()).toBe(10000);
      expect(quote.total.toNumber()).toBe(30000);
    });
  });

  describe("closeBill & laci kas", () => {
    const billRow = {
      id: "txn-1", status: "open", outlet_id: "outlet-1", subtotal: new Prisma.Decimal(20000),
      delivery_fee: new Prisma.Decimal(0), customer_id: null, dining_table_id: null,
    };

    it("menautkan transaksi ke laci yang terbuka SAAT bill ditutup (bukan saat dibuka), sesi dikunci FOR SHARE", async () => {
      const mockTx = buildMockTx({
        $queryRaw: jest.fn().mockImplementation((strings: string[]) =>
          Promise.resolve(rawSql(strings).includes("FROM cash_drawer_sessions") ? [{ id: "drawer-shift-2" }] : [billRow]),
        ),
      });
      prisma.$transaction.mockImplementation((fn: any) => fn(mockTx));
      await service.closeBill("biz-1", "user-1", "txn-1", { payments: [{ payment_channel_id: "channel-1", amount: 20000 }] });
      const [drawerLock] = rawCallsMatching(mockTx.$queryRaw, "FROM cash_drawer_sessions");
      expect(rawSql(drawerLock[0] as string[])).toContain("FOR SHARE");
      expect(drawerLock[1]).toBe("outlet-1");
      expect(mockTx.transaction.update.mock.calls[0][0].data.cash_drawer_session_id).toBe("drawer-shift-2");
    });

    it("tidak ada laci terbuka saat bill ditutup → tautan laci lama dilepas", async () => {
      const mockTx = buildMockTx({
        $queryRaw: jest.fn().mockImplementation((strings: string[]) =>
          Promise.resolve(rawSql(strings).includes("FROM cash_drawer_sessions") ? [] : [billRow]),
        ),
      });
      prisma.$transaction.mockImplementation((fn: any) => fn(mockTx));
      await service.closeBill("biz-1", "user-1", "txn-1", { payments: [{ payment_channel_id: "channel-1", amount: 20000 }] });
      expect(mockTx.transaction.update.mock.calls[0][0].data.cash_drawer_session_id).toBeNull();
    });
  });
});
