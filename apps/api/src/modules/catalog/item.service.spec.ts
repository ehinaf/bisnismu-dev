import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ItemService } from "./item.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ItemService", () => {
  let service: ItemService;
  let prisma: {
    item: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    outlet: { findMany: jest.Mock };
    inventory: { createMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      item: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      outlet: { findMany: jest.fn().mockResolvedValue([{ id: "outlet-1" }, { id: "outlet-2" }]) },
      inventory: { createMany: jest.fn().mockResolvedValue({}) },
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
