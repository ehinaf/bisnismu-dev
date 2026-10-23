import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { ExpenseService } from "./expense.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ExpenseService", () => {
  let service: ExpenseService;
  let prisma: {
    expense: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    outlet: { findFirst: jest.Mock };
    expenseCategory: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      expense: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      outlet: { findFirst: jest.fn().mockResolvedValue({ id: "outlet-1" }) },
      expenseCategory: { findFirst: jest.fn().mockResolvedValue({ id: "cat-1" }) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ExpenseService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ExpenseService);
  });

  it("create() menyisipkan business_id dan created_by dari konteks, nominal sebagai Decimal", async () => {
    prisma.expense.create.mockResolvedValue({});
    await service.create("biz-1", "user-1", { amount: 50000.5, description: "Beli galon", expense_date: "2026-10-23" });

    const data = prisma.expense.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ description: "Beli galon", business_id: "biz-1", created_by: "user-1" });
    expect(data.amount).toBeInstanceOf(Prisma.Decimal);
    expect(data.amount.toString()).toBe("50000.5");
    expect(data.expense_date).toEqual(new Date("2026-10-23T00:00:00.000Z"));
  });

  it("create() menolak outlet atau kategori milik bisnis lain", async () => {
    prisma.outlet.findFirst.mockResolvedValueOnce(null);
    await expect(service.create("biz-1", "user-1", { amount: 1000, outlet_id: "outlet-lain" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.outlet.findFirst).toHaveBeenCalledWith({ where: { id: "outlet-lain", business_id: "biz-1", deleted_at: null } });

    prisma.expenseCategory.findFirst.mockResolvedValueOnce(null);
    await expect(service.create("biz-1", "user-1", { amount: 1000, category_id: "cat-lain" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.expenseCategory.findFirst).toHaveBeenCalledWith({ where: { id: "cat-lain", business_id: "biz-1" } });
    expect(prisma.expense.create).not.toHaveBeenCalled();
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

  it("update() menolak kategori milik bisnis lain dan menyimpan nominal sebagai Decimal", async () => {
    prisma.expense.findFirst.mockResolvedValue({ id: "exp-1", business_id: "biz-1" });
    prisma.expenseCategory.findFirst.mockResolvedValueOnce(null);
    await expect(service.update("biz-1", "exp-1", { category_id: "cat-lain" })).rejects.toThrow(NotFoundException);
    expect(prisma.expense.update).not.toHaveBeenCalled();

    await service.update("biz-1", "exp-1", { amount: 75000 });
    expect(prisma.expense.update.mock.calls[0][0].data.amount.toString()).toBe("75000");
  });
});
