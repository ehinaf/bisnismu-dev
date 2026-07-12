import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { DiscountService } from "./discount.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("DiscountService", () => {
  let service: DiscountService;
  let prisma: {
    discount: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      discount: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [DiscountService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(DiscountService);
  });

  it("create() menyisipkan business_id dari param, bukan dari body", async () => {
    prisma.discount.create.mockResolvedValue({});
    await service.create("biz-1", { name: "Promo 10%", discount_type: "percentage", value: 10 });

    expect(prisma.discount.create).toHaveBeenCalledWith({
      data: {
        business_id: "biz-1",
        name: "Promo 10%",
        discount_type: "percentage",
        value: 10,
        scope: undefined,
        conditions: {},
        start_date: undefined,
        end_date: undefined,
        is_active: undefined,
      },
    });
  });

  it("update() menolak jika diskon tidak ditemukan di business", async () => {
    prisma.discount.findFirst.mockResolvedValue(null);
    await expect(service.update("biz-1", "disc-x", { name: "Baru" })).rejects.toThrow(NotFoundException);
  });

  it("softDelete() mengisi deleted_at", async () => {
    prisma.discount.findFirst.mockResolvedValue({ id: "disc-1" });
    prisma.discount.update.mockResolvedValue({});

    await service.softDelete("biz-1", "disc-1");

    expect(prisma.discount.update).toHaveBeenCalledWith({
      where: { id: "disc-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });
});
