import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { ReportService } from "./report.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ReportService", () => {
  let service: ReportService;
  let prisma: {
    outlet: { findFirst: jest.Mock };
    v_daily_sales: { findMany: jest.Mock };
    expense: { aggregate: jest.Mock; findMany: jest.Mock };
    transactionItem: { groupBy: jest.Mock };
    payment: { groupBy: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      outlet: { findFirst: jest.fn().mockResolvedValue({ id: "outlet-1", business_id: "biz-1" }) },
      v_daily_sales: { findMany: jest.fn() },
      expense: { aggregate: jest.fn(), findMany: jest.fn() },
      transactionItem: { groupBy: jest.fn() },
      payment: { groupBy: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ReportService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ReportService);
  });

  describe("dailySales", () => {
    it("mengonversi transaction_count dari BigInt (hasil view) ke number, supaya bisa di-JSON.stringify", async () => {
      prisma.v_daily_sales.findMany.mockResolvedValue([
        {
          sales_date: new Date("2026-07-01"),
          transaction_count: 7n,
          gross_sales: new Prisma.Decimal(199000),
          total_discounts: new Prisma.Decimal(0),
          total_taxes: new Prisma.Decimal(0),
          gross_profit: new Prisma.Decimal(97200),
        },
      ]);

      const result = await service.dailySales("biz-1", { outlet_id: "outlet-1" });

      expect(typeof result[0].transaction_count).toBe("number");
      expect(result[0].transaction_count).toBe(7);
      expect(() => JSON.stringify(result)).not.toThrow();
    });
  });

  describe("profitLoss", () => {
    it("menolak jika outlet bukan milik business", async () => {
      prisma.outlet.findFirst.mockResolvedValue(null);
      await expect(service.profitLoss("biz-1", { outlet_id: "outlet-x" })).rejects.toThrow(NotFoundException);
    });

    it("menghitung net_profit = gross_profit - total_expenses", async () => {
      prisma.v_daily_sales.findMany.mockResolvedValue([
        {
          transaction_count: 5n,
          gross_sales: new Prisma.Decimal(500000),
          total_discounts: new Prisma.Decimal(0),
          total_taxes: new Prisma.Decimal(50000),
          gross_profit: new Prisma.Decimal(200000),
        },
        {
          transaction_count: 3n,
          gross_sales: new Prisma.Decimal(300000),
          total_discounts: new Prisma.Decimal(0),
          total_taxes: new Prisma.Decimal(30000),
          gross_profit: new Prisma.Decimal(120000),
        },
      ]);
      prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(100000) } });

      const result = await service.profitLoss("biz-1", { outlet_id: "outlet-1" });

      expect(result.transaction_count).toBe(8);
      expect(result.gross_sales.toNumber()).toBe(800000);
      expect(result.gross_profit.toNumber()).toBe(320000);
      expect(result.total_expenses.toNumber()).toBe(100000);
      expect(result.net_profit.toNumber()).toBe(220000); // 320000 - 100000
    });

    it("net_profit tetap benar walau tidak ada expense sama sekali", async () => {
      prisma.v_daily_sales.findMany.mockResolvedValue([
        {
          transaction_count: 1n,
          gross_sales: new Prisma.Decimal(100000),
          total_discounts: new Prisma.Decimal(0),
          total_taxes: new Prisma.Decimal(0),
          gross_profit: new Prisma.Decimal(50000),
        },
      ]);
      prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });

      const result = await service.profitLoss("biz-1", { outlet_id: "outlet-1" });

      expect(result.net_profit.toNumber()).toBe(50000);
    });
  });

  describe("topItems", () => {
    it("memetakan hasil groupBy ke bentuk item_id/item_name/total_qty/total_revenue", async () => {
      prisma.transactionItem.groupBy.mockResolvedValue([
        {
          item_id: "item-1",
          item_name_snapshot: "Nasi Goreng",
          _sum: { quantity: new Prisma.Decimal(10), subtotal: new Prisma.Decimal(200000) },
        },
      ]);

      const result = await service.topItems("biz-1", { outlet_id: "outlet-1", limit: 5 });

      expect(result).toEqual([
        {
          item_id: "item-1",
          item_name: "Nasi Goreng",
          total_qty: expect.objectContaining({}),
          total_revenue: expect.objectContaining({}),
        },
      ]);
      expect(prisma.transactionItem.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5, orderBy: { _sum: { subtotal: "desc" } } }),
      );
    });
  });
});
