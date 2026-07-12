import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ModifierGroupService } from "./modifier-group.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ModifierGroupService", () => {
  let service: ModifierGroupService;
  let prisma: {
    modifierGroup: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      modifierGroup: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ModifierGroupService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ModifierGroupService);
  });

  it("create() menyisipkan business_id dari param, bukan dari body", async () => {
    prisma.modifierGroup.create.mockResolvedValue({});
    await service.create("biz-1", { name: "Level Pedas", is_required: true, min_select: 1, max_select: 1 });

    expect(prisma.modifierGroup.create).toHaveBeenCalledWith({
      data: { name: "Level Pedas", is_required: true, min_select: 1, max_select: 1, business_id: "biz-1" },
    });
  });

  it("update() menolak jika grup tidak ditemukan di business", async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue(null);
    await expect(service.update("biz-1", "grp-x", { name: "Baru" })).rejects.toThrow(NotFoundException);
  });

  it("softDelete() mengisi deleted_at", async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue({ id: "grp-1" });
    prisma.modifierGroup.update.mockResolvedValue({});

    await service.softDelete("biz-1", "grp-1");

    expect(prisma.modifierGroup.update).toHaveBeenCalledWith({
      where: { id: "grp-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });
});
