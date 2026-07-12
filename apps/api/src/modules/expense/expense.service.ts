import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import { ExpenseQueryDto } from "./dto/expense-query.dto";

@Injectable()
export class ExpenseService {
  constructor(private readonly prisma: PrismaService) {}

  list(business_id: string, query: ExpenseQueryDto) {
    const expenseDate =
      query.from || query.to
        ? { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) }
        : undefined;

    return this.prisma.expense.findMany({
      where: {
        business_id,
        ...(query.outlet_id ? { outlet_id: query.outlet_id } : {}),
        ...(expenseDate ? { expense_date: expenseDate } : {}),
      },
      include: { category: { select: { name: true } } },
      orderBy: { expense_date: "desc" },
    });
  }

  async getOne(business_id: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, business_id },
      include: { category: { select: { name: true } } },
    });
    if (!expense) throw new NotFoundException("Pengeluaran tidak ditemukan");
    return expense;
  }

  create(business_id: string, userId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: { ...dto, business_id, created_by: userId },
    });
  }

  async update(business_id: string, id: string, dto: UpdateExpenseDto) {
    await this.getOne(business_id, id);
    return this.prisma.expense.update({ where: { id }, data: dto });
  }

  // Tidak ada delete: `expenses` tidak punya kolom deleted_at di skema.
}
