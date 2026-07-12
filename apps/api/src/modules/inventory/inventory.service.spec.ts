import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { InventoryService } from "./inventory.service";
import { PrismaService } from "../../prisma/prisma.service";

function buildMockTx(overrides: Record<string, unknown> = {}) {
  const base = {
    outlet: { findFirst: jest.fn().mockResolvedValue({ id: "outlet-1", business_id: "biz-1" }) },
    item: { findFirst: jest.fn().mockResolvedValue({ id: "item-1", business_id: "biz-1", name: "Beras" }) },
    inventory: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "inv-1", ...data })) },
    stockMovement: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: "inv-1", quantity_on_hand: new Prisma.Decimal(20) }]),
  };
  return { ...base, ...overrides } as any;
}

describe("InventoryService", () => {
  let service: InventoryService;
  let prisma: { $transaction: jest.Mock; outlet: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      outlet: { findFirst: jest.fn().mockResolvedValue({ id: "outlet-1", business_id: "biz-1" }) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [InventoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(InventoryService);
  });

  async function runAdjust(mockTx: ReturnType<typeof buildMockTx>, dto: Parameters<InventoryService["adjust"]>[2]) {
    prisma.$transaction.mockImplementation((fn: any) => fn(mockTx));
    return service.adjust("biz-1", "user-1", dto);
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
    expect(mockTx.inventory.update).toHaveBeenCalled();
  });
});
