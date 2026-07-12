import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { VariantService } from "./variant.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("VariantService", () => {
  let service: VariantService;
  let prisma: {
    item: { findFirst: jest.Mock; findUniqueOrThrow: jest.Mock };
    itemVariant: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    outlet: { findMany: jest.Mock };
    inventory: { createMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      item: {
        findFirst: jest.fn().mockResolvedValue({ id: "item-1", business_id: "biz-1" }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "item-1", track_stock: true }),
      },
      itemVariant: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      outlet: { findMany: jest.fn().mockResolvedValue([{ id: "outlet-1" }]) },
      inventory: { createMany: jest.fn().mockResolvedValue({}) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [VariantService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(VariantService);
  });

  describe("create", () => {
    it("menolak jika item induk tidak ditemukan di business", async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(service.create("biz-1", "item-x", { name: "Large" })).rejects.toThrow(NotFoundException);
    });

    it("membuat inventory per outlet untuk varian baru jika item induk track_stock", async () => {
      prisma.itemVariant.create.mockResolvedValue({ id: "variant-1" });

      await service.create("biz-1", "item-1", { name: "Large", price_adjustment: 5000 });

      expect(prisma.inventory.createMany).toHaveBeenCalledWith({
        data: [{ outlet_id: "outlet-1", item_id: "item-1", variant_id: "variant-1", quantity_on_hand: 0 }],
      });
    });
  });

  describe("softDelete", () => {
    it("menolak jika varian tidak ditemukan", async () => {
      prisma.itemVariant.findFirst.mockResolvedValue(null);
      await expect(service.softDelete("biz-1", "item-1", "variant-x")).rejects.toThrow(NotFoundException);
    });

    it("soft delete varian", async () => {
      prisma.itemVariant.findFirst.mockResolvedValue({ id: "variant-1" });
      prisma.itemVariant.update.mockResolvedValue({});

      await service.softDelete("biz-1", "item-1", "variant-1");

      expect(prisma.itemVariant.update).toHaveBeenCalledWith({
        where: { id: "variant-1" },
        data: { deleted_at: expect.any(Date), is_active: false },
      });
    });
  });
});
