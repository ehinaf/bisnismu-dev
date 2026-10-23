import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { InventoryService } from "./inventory.service";
import { PrismaService } from "../../prisma/prisma.service";

function buildMockTx(overrides: Record<string, unknown> = {}) {
  const base = {
    outlet: { findFirst: jest.fn().mockResolvedValue({ id: "outlet-1", business_id: "biz-1" }) },
    item: { findFirst: jest.fn().mockResolvedValue({ id: "item-1", business_id: "biz-1", name: "Beras" }) },
    inventory: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "inv-1", ...data })) },
    stockMovement: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: "inv-1", quantity_on_hand: new Prisma.Decimal(20) }]),
  };
  return { ...base, ...overrides } as any;
}

describe("InventoryService", () => {
  let service: InventoryService;
  let prisma: {
    $transaction: jest.Mock;
    outlet: { findFirst: jest.Mock };
    inventory: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      outlet: { findFirst: jest.fn().mockResolvedValue({ id: "outlet-1", business_id: "biz-1" }) },
      inventory: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [InventoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(InventoryService);
  });

  async function runAdjust(mockTx: ReturnType<typeof buildMockTx>, dto: Parameters<InventoryService["adjust"]>[2]) {
    prisma.$transaction.mockImplementation((fn: any) => fn(mockTx));
    return service.adjust("biz-1", "user-1", dto, "10.0.0.7");
  }

  it("menolak jika outlet bukan milik business", async () => {
    const mockTx = buildMockTx({ outlet: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(
      runAdjust(mockTx, { outlet_id: "outlet-x", item_id: "item-1", new_quantity: 10, reason: "koreksi" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("menolak jika baris inventory belum terdaftar", async () => {
    const mockTx = buildMockTx({ $queryRaw: jest.fn().mockResolvedValue([]) });
    await expect(
      runAdjust(mockTx, { outlet_id: "outlet-1", item_id: "item-1", new_quantity: 10, reason: "koreksi" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("menghitung delta positif dengan benar dan mencatat stock_movement", async () => {
    const mockTx = buildMockTx();
    await runAdjust(mockTx, { outlet_id: "outlet-1", item_id: "item-1", new_quantity: 35, reason: "stok opname" });

    expect(mockTx.inventory.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { quantity_on_hand: expect.objectContaining({}) },
    });
    const movementArgs = mockTx.stockMovement.create.mock.calls[0][0].data;
    expect((movementArgs.quantity as Prisma.Decimal).toNumber()).toBe(15); // 35 - 20
    expect(movementArgs.movement_type).toBe("adjustment");
    expect(movementArgs.notes).toBe("stok opname");
  });

  it("mencatat audit adjust_stock (stok lama → baru, alasan, IP) di transaksi yang sama", async () => {
    const mockTx = buildMockTx();
    await runAdjust(mockTx, { outlet_id: "outlet-1", item_id: "item-1", new_quantity: 35, reason: "stok opname" });

    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        business_id: "biz-1",
        user_id: "user-1",
        action: "adjust_stock",
        entity_type: "inventory",
        entity_id: "inv-1",
        old_value: { quantity_on_hand: "20" },
        new_value: { quantity_on_hand: "35", reason: "stok opname" },
        ip_address: "10.0.0.7",
      }),
    });
  });

  it("menghitung delta negatif dengan benar (koreksi turun)", async () => {
    const mockTx = buildMockTx();
    await runAdjust(mockTx, { outlet_id: "outlet-1", item_id: "item-1", new_quantity: 5, reason: "barang rusak" });

    const movementArgs = mockTx.stockMovement.create.mock.calls[0][0].data;
    expect((movementArgs.quantity as Prisma.Decimal).toNumber()).toBe(-15); // 5 - 20
  });

  it("tidak mencatat stock_movement jika quantity tidak berubah", async () => {
    const mockTx = buildMockTx();
    await runAdjust(mockTx, { outlet_id: "outlet-1", item_id: "item-1", new_quantity: 20, reason: "cek rutin" });

    expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
    expect(mockTx.inventory.update).toHaveBeenCalled();
  });

  it("delta: barang masuk dihitung dari stok terkunci di server, bukan dari angka di browser", async () => {
    const mockTx = buildMockTx();
    await runAdjust(mockTx, { outlet_id: "outlet-1", item_id: "item-1", delta: 12.5, reason: "Barang masuk" });
    const data = mockTx.inventory.update.mock.calls[0][0].data;
    expect(data.quantity_on_hand.toString()).toBe("32.5");
    expect(mockTx.stockMovement.create.mock.calls[0][0].data.quantity.toString()).toBe("12.5");
  });

  it("delta negatif melebihi stok → ditolak, tidak ada perubahan", async () => {
    const mockTx = buildMockTx();
    await expect(
      runAdjust(mockTx, { outlet_id: "outlet-1", item_id: "item-1", delta: -21, reason: "Rusak" }),
    ).rejects.toThrow(BadRequestException);
    expect(mockTx.inventory.update).not.toHaveBeenCalled();
  });

  it("harus tepat salah satu: new_quantity atau delta", async () => {
    const mockTx = buildMockTx();
    await expect(
      runAdjust(mockTx, { outlet_id: "outlet-1", item_id: "item-1", new_quantity: 5, delta: 1, reason: "x" }),
    ).rejects.toThrow(BadRequestException);
    await expect(runAdjust(mockTx, { outlet_id: "outlet-1", item_id: "item-1", reason: "x" })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe("halaman Stok", () => {
    const row = (over: Record<string, unknown>) => ({
      id: "inv",
      item_id: "item-1",
      variant_id: null,
      quantity_on_hand: new Prisma.Decimal(5),
      reorder_level: new Prisma.Decimal(0),
      updated_at: new Date(),
      item: { name: "Kopi", sku: null, unit: null, _count: { variants: 0 } },
      variant: null,
      ...over,
    });

    it("list() hanya item bisnis ini yang melacak stok & belum dihapus; baris induk item bervarian disembunyikan", async () => {
      prisma.inventory.findMany.mockResolvedValue([
        row({ id: "biasa" }),
        row({ id: "induk-kaos", item_id: "kaos", item: { name: "Kaos", sku: null, unit: null, _count: { variants: 2 } } }),
        row({
          id: "kaos-m",
          item_id: "kaos",
          variant_id: "v-m",
          variant: { name: "M" },
          item: { name: "Kaos", sku: null, unit: null, _count: { variants: 2 } },
        }),
      ]);
      const result = await service.list("biz-1", "outlet-1");

      expect(prisma.inventory.findMany.mock.calls[0][0].where).toEqual({
        outlet_id: "outlet-1",
        item: { business_id: "biz-1", track_stock: true, deleted_at: null },
        OR: [{ variant_id: null }, { variant: { deleted_at: null } }],
      });
      expect(result.map((r) => r.id)).toEqual(["biasa", "kaos-m"]);
      expect(result[1]).toMatchObject({ item_name: "Kaos", variant_name: "M" });
    });

    it("lowStock() = stok ≤ batas minimum, termasuk yang habis", async () => {
      prisma.inventory.findMany.mockResolvedValue([
        row({ id: "aman", quantity_on_hand: new Prisma.Decimal(10), reorder_level: new Prisma.Decimal(5) }),
        row({ id: "menipis", quantity_on_hand: new Prisma.Decimal(5), reorder_level: new Prisma.Decimal(5) }),
        row({ id: "habis", quantity_on_hand: new Prisma.Decimal(0), reorder_level: new Prisma.Decimal(0) }),
      ]);
      const result = await service.lowStock("biz-1", "outlet-1");
      expect(result.map((r) => r.id)).toEqual(["menipis", "habis"]);
    });

    it("updateReorderLevel() menyimpan Decimal pada baris milik bisnis ini", async () => {
      prisma.inventory.findFirst.mockResolvedValue({ id: "inv-9" });
      await service.updateReorderLevel("biz-1", { outlet_id: "outlet-1", item_id: "item-1", reorder_level: 2.5 });

      expect(prisma.inventory.findFirst.mock.calls[0][0].where).toEqual({
        outlet_id: "outlet-1",
        item_id: "item-1",
        variant_id: null,
        item: { business_id: "biz-1", deleted_at: null },
      });
      const data = prisma.inventory.update.mock.calls[0][0].data;
      expect(data.reorder_level).toBeInstanceOf(Prisma.Decimal);
      expect(data.reorder_level.toString()).toBe("2.5");
    });

    it("updateReorderLevel() menolak baris yang tidak ada / milik bisnis lain", async () => {
      prisma.inventory.findFirst.mockResolvedValue(null);
      await expect(
        service.updateReorderLevel("biz-1", { outlet_id: "outlet-1", item_id: "item-x", reorder_level: 1 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.inventory.update).not.toHaveBeenCalled();
    });
  });
});
