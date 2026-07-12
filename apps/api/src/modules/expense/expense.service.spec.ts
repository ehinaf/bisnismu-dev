import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ExpenseService } from "./expense.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ExpenseService", () => {
  let service: ExpenseService;
  let prisma: { expense: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      expense: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ExpenseService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ExpenseService);
  });

  it("create() menyisipkan business_id dan created_by dari konteks, bukan dari body", async () => {
    prisma.expense.create.mockResolvedValue({});
    await service.create("biz-1", "user-1", { amount: 50000, description: "Beli galon" });

    expect(prisma.expense.create).toHaveBeenCalledWith({
      data: { amount: 50000, description: "Beli galon", business_id: "biz-1", created_by: "user-1" },
    });
  });

  it("list() memfilter berdasar outlet_id dan rentang tanggal jika diberikan", async () => {
    prisma.expense.findMany.mockResolvedValue([]);
    await service.list("biz-1", { outlet_id: "outlet-1", from: "2026-01-01", to: "2026-01-31" });

    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          business_id: "biz-1",
          outlet_id: "outlet-1",
          expense_date: { gte: new Date("2026-01-01"), lte: new Date("2026-01-31") },
        },
      }),
    );
  });

  it("getOne() melempar NotFoundException jika tidak ditemukan", async () => {
    prisma.expense.findFirst.mockResolvedValue(null);
    await expect(service.getOne("biz-1", "exp-x")).rejects.toThrow(NotFoundException);
  });

  it("update() menolak jika expense milik business lain", async () => {
    prisma.expense.findFirst.mockResolvedValue(null);
    await expect(service.update("biz-1", "exp-x", { amount: 1000 })).rejects.toThrow(NotFoundException);
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });
});
