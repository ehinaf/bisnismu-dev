import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { ItemService } from "./item.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ItemService", () => {
  let service: ItemService;
  let prisma: {
    item: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    outlet: { findMany: jest.Mock };
    inventory: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      item: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      outlet: { findMany: jest.fn().mockResolvedValue([{ id: "outlet-1" }, { id: "outlet-2" }]) },
      inventory: { createMany: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ItemService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ItemService);
  });

  describe("create", () => {
    it("membuat baris inventory (stok 0) di semua outlet jika track_stock true", async () => {
      prisma.item.create.mockResolvedValue({ id: "item-1", track_stock: true });

      await service.create("biz-1", { name: "Kopi Susu", base_price: 15000 });

      expect(prisma.inventory.createMany).toHaveBeenCalledWith({
        data: [
          { outlet_id: "outlet-1", item_id: "item-1", quantity_on_hand: 0 },
          { outlet_id: "outlet-2", item_id: "item-1", quantity_on_hand: 0 },
        ],
      });
    });

    it("tidak membuat baris inventory jika track_stock false (jasa)", async () => {
      prisma.item.create.mockResolvedValue({ id: "item-2", track_stock: false });

      await service.create("biz-1", { name: "Cuci Sepatu", base_price: 20000, track_stock: false });

      expect(prisma.inventory.createMany).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    const existing = { id: "item-1", base_price: new Prisma.Decimal(15000), cost_price: new Prisma.Decimal(8000) };

    it("perubahan non-harga: update biasa tanpa audit", async () => {
      prisma.item.findFirst.mockResolvedValue(existing);
      prisma.item.update.mockResolvedValue({});

      await service.update("biz-1", "item-1", { name: "Kopi Susu Gula Aren", base_price: 15000 });

      expect(prisma.item.update).toHaveBeenCalledWith({
        where: { id: "item-1" },
        data: { name: "Kopi Susu Gula Aren", base_price: 15000 },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("ubah harga jual: update + audit update_item_price dalam satu transaksi", async () => {
      prisma.item.findFirst.mockResolvedValue(existing);
      const tx = {
        item: {
          update: jest.fn().mockResolvedValue({
            ...existing,
            base_price: new Prisma.Decimal(17000),
          }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));

      await service.update("biz-1", "item-1", { base_price: 17000 }, { userId: "user-1", ip: "127.0.0.1" });

      expect(prisma.item.update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "update_item_price",
          entity_id: "item-1",
          user_id: "user-1",
          old_value: { base_price: "15000", cost_price: "8000" },
          new_value: { base_price: "17000", cost_price: "8000" },
          ip_address: "127.0.0.1",
        }),
      });
    });
  });

  describe("softDelete", () => {
    it("menolak jika item tidak ditemukan", async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(service.softDelete("biz-1", "item-x")).rejects.toThrow(NotFoundException);
    });

    it("set deleted_at dan is_active=false, bukan hard delete", async () => {
      prisma.item.findFirst.mockResolvedValue({ id: "item-1" });
      prisma.item.update.mockResolvedValue({});

      await service.softDelete("biz-1", "item-1");

      expect(prisma.item.update).toHaveBeenCalledWith({
        where: { id: "item-1" },
        data: { deleted_at: expect.any(Date), is_active: false },
      });
    });
  });
});
