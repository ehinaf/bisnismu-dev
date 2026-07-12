import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PriceTierService } from "./price-tier.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("PriceTierService", () => {
  let service: PriceTierService;
  let prisma: {
    item: { findFirst: jest.Mock };
    priceTier: { findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      item: { findFirst: jest.fn().mockResolvedValue({ id: "item-1", business_id: "biz-1" }) },
      priceTier: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [PriceTierService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PriceTierService);
  });

  it("menolak jika item bukan milik business", async () => {
    prisma.item.findFirst.mockResolvedValue(null);
    await expect(service.create("biz-1", "item-x", { min_qty: 12, price: 17000 })).rejects.toThrow(NotFoundException);
  });

  it("create() menyisipkan item_id dari param, bukan dari body", async () => {
    prisma.priceTier.create.mockResolvedValue({});
    await service.create("biz-1", "item-1", { min_qty: 12, price: 17000 });

    expect(prisma.priceTier.create).toHaveBeenCalledWith({
      data: { min_qty: 12, price: 17000, item_id: "item-1" },
    });
  });

  it("update() menolak jika tier tidak ditemukan", async () => {
    prisma.priceTier.findFirst.mockResolvedValue(null);
    await expect(service.update("biz-1", "item-1", "tier-x", { price: 1000 })).rejects.toThrow(NotFoundException);
  });
});
