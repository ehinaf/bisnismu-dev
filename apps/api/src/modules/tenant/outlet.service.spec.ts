import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { OutletService } from "./outlet.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("OutletService", () => {
  let service: OutletService;
  let prisma: {
    outlet: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      outlet: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [OutletService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(OutletService);
  });

  it("list() hanya query outlet milik business_id yang diminta", async () => {
    prisma.outlet.findMany.mockResolvedValue([{ id: "o1", business_id: "biz-1" }]);
    await service.list("biz-1");
    expect(prisma.outlet.findMany).toHaveBeenCalledWith({
      where: { business_id: "biz-1", deleted_at: null },
      orderBy: { created_at: "asc" },
    });
  });

  it("getOne() melempar NotFoundException jika outlet milik business lain", async () => {
    prisma.outlet.findFirst.mockResolvedValue(null);
    await expect(service.getOne("biz-1", "outlet-milik-biz-lain")).rejects.toThrow(NotFoundException);
    expect(prisma.outlet.findFirst).toHaveBeenCalledWith({
      where: { id: "outlet-milik-biz-lain", business_id: "biz-1", deleted_at: null },
    });
  });

  function mockCreateTx(items: Array<{ id: string; variants: Array<{ id: string }> }>) {
    const tx = {
      outlet: { create: jest.fn().mockResolvedValue({ id: "o1", business_id: "biz-1", name: "Cabang Utama" }) },
      item: { findMany: jest.fn().mockResolvedValue(items) },
      inventory: { createMany: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
    return tx;
  }

  it("create() menyisipkan business_id dari konteks, bukan dari body", async () => {
    const tx = mockCreateTx([]);
    await service.create("biz-1", { name: "Cabang Utama" });
    expect(tx.outlet.create).toHaveBeenCalledWith({
      data: { name: "Cabang Utama", business_id: "biz-1" },
    });
    expect(tx.inventory.createMany).not.toHaveBeenCalled();
  });

  it("create() memberi baris stok 0 untuk item yang melacak stok beserta variannya", async () => {
    const tx = mockCreateTx([
      { id: "item-1", variants: [] },
      { id: "item-2", variants: [{ id: "var-a" }, { id: "var-b" }] },
    ]);
    await service.create("biz-1", { name: "Cabang Baru" });

    expect(tx.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { business_id: "biz-1", track_stock: true, deleted_at: null } }),
    );
    expect(tx.inventory.createMany).toHaveBeenCalledWith({
      data: [
        { outlet_id: "o1", item_id: "item-1", variant_id: null, quantity_on_hand: 0 },
        { outlet_id: "o1", item_id: "item-2", variant_id: null, quantity_on_hand: 0 },
        { outlet_id: "o1", item_id: "item-2", variant_id: "var-a", quantity_on_hand: 0 },
        { outlet_id: "o1", item_id: "item-2", variant_id: "var-b", quantity_on_hand: 0 },
      ],
    });
  });

  it("softDelete() set deleted_at dan is_active=false, bukan hard delete", async () => {
    prisma.outlet.findFirst.mockResolvedValue({ id: "o1", business_id: "biz-1" });
    prisma.outlet.update.mockResolvedValue({ id: "o1", deleted_at: new Date() });

    await service.softDelete("biz-1", "o1");

    expect(prisma.outlet.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { deleted_at: expect.any(Date), is_active: false },
    });
  });

  it("softDelete() menolak outlet yang tidak ditemukan di business tsb", async () => {
    prisma.outlet.findFirst.mockResolvedValue(null);
    await expect(service.softDelete("biz-1", "o-tidak-ada")).rejects.toThrow(NotFoundException);
    expect(prisma.outlet.update).not.toHaveBeenCalled();
  });
});
