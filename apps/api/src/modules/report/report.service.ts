import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { DateRangeQueryDto } from "./dto/date-range-query.dto";
import { toCsv } from "./csv.util";

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOutletInBusiness(business_id: string, outlet_id: string) {
    const outlet = await this.prisma.outlet.findFirst({ where: { id: outlet_id, business_id, deleted_at: null } });
    if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");
  }

  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  receivables(business_id: string) {
    return this.prisma.v_outstanding_receivables.findMany({
      where: { business_id },
      orderBy: { due_date: "asc" },
    });
  }

  async dailySales(business_id: string, query: DateRangeQueryDto) {
    await this.assertOutletInBusiness(business_id, query.outlet_id);
    const salesDate = this.dateRange(query.from, query.to);
    const rows = await this.prisma.v_daily_sales.findMany({
      where: {
        business_id,
        outlet_id: query.outlet_id,
        ...(salesDate ? { sales_date: salesDate } : {}),
      },
      orderBy: { sales_date: "asc" },
    });

    // transaction_count datang sebagai BigInt dari view (COUNT(*) Postgres) -
    // JSON.stringify tidak bisa serialize BigInt, jadi dikonversi ke number di sini.
    return rows.map((r) => ({ ...r, transaction_count: Number(r.transaction_count) }));
  }

  async topItems(business_id: string, query: DateRangeQueryDto) {
    await this.assertOutletInBusiness(business_id, query.outlet_id);
    const createdAt = this.dateRange(query.from, query.to);

    const rows = await this.prisma.transactionItem.groupBy({
      by: ["item_id", "item_name_snapshot"],
      where: {
        transaction: {
          business_id,
          outlet_id: query.outlet_id,
          status: "completed",
          ...(createdAt ? { created_at: createdAt } : {}),
        },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: "desc" } },
      take: query.limit ?? 10,
    });

    return rows.map((r) => ({
      item_id: r.item_id,
      item_name: r.item_name_snapshot,
      total_qty: r._sum.quantity,
      total_revenue: r._sum.subtotal,
    }));
  }

  async paymentMethods(business_id: string, query: DateRangeQueryDto) {
    await this.assertOutletInBusiness(business_id, query.outlet_id);
    const createdAt = this.dateRange(query.from, query.to);

    const rows = await this.prisma.payment.groupBy({
      by: ["channel_name_snapshot"],
      where: {
        transaction: {
          business_id,
          outlet_id: query.outlet_id,
          status: "completed",
          ...(createdAt ? { created_at: createdAt } : {}),
        },
      },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: "desc" } },
    });

    return rows.map((r) => ({
      channel_name: r.channel_name_snapshot,
      transaction_count: r._count._all,
      total_amount: r._sum.amount,
    }));
  }

  async profitLoss(business_id: string, query: DateRangeQueryDto) {
    await this.assertOutletInBusiness(business_id, query.outlet_id);
    const salesDate = this.dateRange(query.from, query.to);
    const expenseDate = this.dateRange(query.from, query.to);

    const salesRows = await this.prisma.v_daily_sales.findMany({
      where: {
        business_id,
        outlet_id: query.outlet_id,
        ...(salesDate ? { sales_date: salesDate } : {}),
      },
    });

    const grossSales = salesRows.reduce((sum, r) => sum.plus(r.gross_sales), new Prisma.Decimal(0));
    const totalDiscounts = salesRows.reduce((sum, r) => sum.plus(r.total_discounts), new Prisma.Decimal(0));
    const totalTaxes = salesRows.reduce((sum, r) => sum.plus(r.total_taxes), new Prisma.Decimal(0));
    const grossProfit = salesRows.reduce((sum, r) => sum.plus(r.gross_profit), new Prisma.Decimal(0));

    const expenseAgg = await this.prisma.expense.aggregate({
      where: {
        business_id,
        outlet_id: query.outlet_id,
        ...(expenseDate ? { expense_date: expenseDate } : {}),
      },
      _sum: { amount: true },
    });
    const totalExpenses = new Prisma.Decimal(expenseAgg._sum.amount ?? 0);
    const netProfit = grossProfit.minus(totalExpenses);

    return {
      transaction_count: salesRows.reduce((sum, r) => sum + Number(r.transaction_count), 0),
      gross_sales: grossSales,
      total_discounts: totalDiscounts,
      total_taxes: totalTaxes,
      gross_profit: grossProfit,
      total_expenses: totalExpenses,
      net_profit: netProfit,
    };
  }

  async exportDailySalesCsv(business_id: string, query: DateRangeQueryDto): Promise<string> {
    const rows = await this.dailySales(business_id, query);
    return toCsv(
      rows.map((r) => ({
        sales_date: r.sales_date.toISOString().slice(0, 10),
        transaction_count: r.transaction_count.toString(),
        gross_sales: r.gross_sales.toFixed(2),
        total_discounts: r.total_discounts.toFixed(2),
        total_taxes: r.total_taxes.toFixed(2),
        gross_profit: r.gross_profit.toFixed(2),
      })),
    );
  }

  async exportExpensesCsv(business_id: string, query: DateRangeQueryDto): Promise<string> {
    await this.assertOutletInBusiness(business_id, query.outlet_id);
    const expenseDate = this.dateRange(query.from, query.to);

    const expenses = await this.prisma.expense.findMany({
      where: {
        business_id,
        outlet_id: query.outlet_id,
        ...(expenseDate ? { expense_date: expenseDate } : {}),
      },
      include: { category: { select: { name: true } } },
      orderBy: { expense_date: "asc" },
    });

    return toCsv(
      expenses.map((e) => ({
        expense_date: e.expense_date.toISOString().slice(0, 10),
        category: e.category?.name ?? "",
        amount: e.amount.toFixed(2),
        description: e.description ?? "",
      })),
    );
  }
}
