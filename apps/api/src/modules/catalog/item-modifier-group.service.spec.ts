import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { ItemModifierGroupService } from "./item-modifier-group.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ItemModifierGroupService", () => {
  let service: ItemModifierGroupService;
  let prisma: {
    item: { findFirst: jest.Mock };
    modifierGroup: { findFirst: jest.Mock };
    itemModifierGroup: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      item: { findFirst: jest.fn().mockResolvedValue({ id: "item-1", business_id: "biz-1" }) },
      modifierGroup: { findFirst: jest.fn().mockResolvedValue({ id: "grp-1", business_id: "biz-1" }) },
      itemModifierGroup: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ItemModifierGroupService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ItemModifierGroupService);
  });

  describe("attach", () => {
    it("menolak jika item bukan milik business", async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(service.attach("biz-1", "item-x", "grp-1")).rejects.toThrow(NotFoundException);
    });

    it("menolak jika grup modifier bukan milik business", async () => {
      prisma.modifierGroup.findFirst.mockResolvedValue(null);
      await expect(service.attach("biz-1", "item-1", "grp-x")).rejects.toThrow(NotFoundException);
    });

    it("menolak jika grup sudah terpasang sebelumnya", async () => {
      prisma.itemModifierGroup.findUnique.mockResolvedValue({ item_id: "item-1", modifier_group_id: "grp-1" });
      await expect(service.attach("biz-1", "item-1", "grp-1")).rejects.toThrow(ConflictException);
    });

    it("memasang grup modifier ke item", async () => {
      prisma.itemModifierGroup.findUnique.mockResolvedValue(null);
      prisma.itemModifierGroup.create.mockResolvedValue({});

      await service.attach("biz-1", "item-1", "grp-1");

      expect(prisma.itemModifierGroup.create).toHaveBeenCalledWith({
        data: { item_id: "item-1", modifier_group_id: "grp-1" },
      });
    });
  });

  describe("detach", () => {
    it("menolak jika grup belum terpasang", async () => {
      prisma.itemModifierGroup.findUnique.mockResolvedValue(null);
      await expect(service.detach("biz-1", "item-1", "grp-1")).rejects.toThrow(NotFoundException);
    });

    it("melepas grup modifier dari item", async () => {
      prisma.itemModifierGroup.findUnique.mockResolvedValue({ item_id: "item-1", modifier_group_id: "grp-1" });
      prisma.itemModifierGroup.delete.mockResolvedValue({});

      await service.detach("biz-1", "item-1", "grp-1");

      expect(prisma.itemModifierGroup.delete).toHaveBeenCalledWith({
        where: { item_id_modifier_group_id: { item_id: "item-1", modifier_group_id: "grp-1" } },
      });
    });
  });
});
