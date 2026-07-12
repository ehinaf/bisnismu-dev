import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ModifierService } from "./modifier.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ModifierService", () => {
  let service: ModifierService;
  let prisma: {
    modifierGroup: { findFirst: jest.Mock };
    modifier: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      modifierGroup: { findFirst: jest.fn().mockResolvedValue({ id: "grp-1", business_id: "biz-1" }) },
      modifier: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ModifierService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ModifierService);
  });

  it("menolak jika grup modifier bukan milik business", async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue(null);
    await expect(service.create("biz-1", "grp-x", { name: "Keju" })).rejects.toThrow(NotFoundException);
  });

  it("create() menyisipkan modifier_group_id dari param", async () => {
    prisma.modifier.create.mockResolvedValue({});
    await service.create("biz-1", "grp-1", { name: "Keju", price_adjustment: 3000 });

    expect(prisma.modifier.create).toHaveBeenCalledWith({
      data: { name: "Keju", price_adjustment: 3000, modifier_group_id: "grp-1" },
    });
  });

  it("update() menolak jika modifier tidak ditemukan", async () => {
    prisma.modifier.findFirst.mockResolvedValue(null);
    await expect(service.update("biz-1", "grp-1", "mod-x", { is_active: false })).rejects.toThrow(NotFoundException);
  });

  it("update() bisa menonaktifkan modifier (is_active=false) sebagai pengganti delete", async () => {
    prisma.modifier.findFirst.mockResolvedValue({ id: "mod-1" });
    prisma.modifier.update.mockResolvedValue({});

    await service.update("biz-1", "grp-1", "mod-1", { is_active: false });

    expect(prisma.modifier.update).toHaveBeenCalledWith({
      where: { id: "mod-1" },
      data: { is_active: false },
    });
  });
});
