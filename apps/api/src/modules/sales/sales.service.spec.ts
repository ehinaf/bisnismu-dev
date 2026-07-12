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
    },
    transactionItemModifier: { create: jest.fn().mockResolvedValue({}) },
    transactionTax: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
    itemModifierGroup: { findMany: jest.fn().mockResolvedValue([]) },
    modifier: { findMany: jest.fn().mockResolvedValue([]) },
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
    expect(mockTx.$queryRaw).not.toHaveBeenCalled();
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
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ id: "txn-1", status: "completed", total: new Prisma.Decimal(20000), customer_id: null, dining_table_id: null }]),
      });
      await expect(
        runClose("txn-1", { payments: [{ payment_channel_id: "channel-1", amount: 20000 }] }, mockTx),
      ).rejects.toThrow(BadRequestException);
    });

    it("menolak jika pembayaran kurang dari total bill", async () => {
      const mockTx = buildMockTx({
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ id: "txn-1", status: "open", total: new Prisma.Decimal(20000), customer_id: null, dining_table_id: null }]),
      });
      await expect(
        runClose("txn-1", { payments: [{ payment_channel_id: "channel-1", amount: 5000 }] }, mockTx),
      ).rejects.toThrow(BadRequestException);
    });

    it("menutup bill (status completed) dan membebaskan meja", async () => {
      const mockTx = buildMockTx({
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            { id: "txn-1", status: "open", total: new Prisma.Decimal(20000), customer_id: null, dining_table_id: "table-1" },
          ]),
      });

      await runClose("txn-1", { payments: [{ payment_channel_id: "channel-1", amount: 20000 }] }, mockTx);

      const updateArgs = mockTx.transaction.update.mock.calls[0][0].data;
      expect(updateArgs.status).toBe("completed");
      expect(updateArgs.amount_paid.toNumber()).toBe(20000);
      expect(mockTx.diningTable.update).toHaveBeenCalledWith({
        where: { id: "table-1" },
        data: { status: "available" },
      });
      expect(mockTx.payment.create).toHaveBeenCalledTimes(1);
    });
  });
});
