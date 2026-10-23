import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { VariantService } from "./variant.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("VariantService", () => {
  let service: VariantService;
  let prisma: {
    item: { findFirst: jest.Mock; findUniqueOrThrow: jest.Mock };
    itemVariant: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    outlet: { findMany: jest.Mock };
    inventory: { createMany: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      item: {
        findFirst: jest.fn().mockResolvedValue({ id: "item-1", business_id: "biz-1", track_stock: true }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "item-1", track_stock: true }),
      },
      itemVariant: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      outlet: { findMany: jest.fn().mockResolvedValue([{ id: "outlet-1" }]) },
      inventory: { createMany: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      // Transaksi memakai mock yang sama sebagai client-nya.
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
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
      expect(prisma.$transaction).toHaveBeenCalled();
      const data = prisma.itemVariant.create.mock.calls[0][0].data;
      expect(data.price_adjustment).toBeInstanceOf(Prisma.Decimal);
      expect(data.price_adjustment.toString()).toBe("5000");
    });
  });

  describe("update", () => {
    const existing = {
      id: "variant-1",
      price_adjustment: new Prisma.Decimal(5000),
      cost_adjustment: new Prisma.Decimal(0),
    };

    it("ubah selisih harga → tercatat di audit (aksi sensitif)", async () => {
      prisma.itemVariant.findFirst.mockResolvedValue(existing);
      prisma.itemVariant.update.mockImplementation(({ data }) => ({ ...existing, ...data, cost_adjustment: existing.cost_adjustment }));

      await service.update("biz-1", "item-1", "variant-1", { price_adjustment: 7000 }, { userId: "owner-1", ip: null });

      const log = prisma.auditLog.create.mock.calls[0][0].data;
      expect(log.action).toBe("update_item_price");
      expect(log.entity_type).toBe("item_variant");
      expect(log.old_value.price_adjustment).toBe("5000");
      expect(log.new_value.price_adjustment).toBe("7000");
    });

    it("ganti nama/barcode saja tidak menulis audit harga", async () => {
      prisma.itemVariant.findFirst.mockResolvedValue(existing);
      prisma.itemVariant.update.mockResolvedValue(existing);
      await service.update("biz-1", "item-1", "variant-1", { name: "XL", barcode: "899123" });
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
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
