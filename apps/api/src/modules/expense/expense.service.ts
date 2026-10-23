import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import { ExpenseQueryDto } from "./dto/expense-query.dto";

// Kolom DATE: "2026-10-23" → Date tengah malam UTC; Postgres menyimpan tanggal
// kalendernya apa adanya (Prisma menolak string tanggal tanpa jam untuk DateTime).
const toDate = (value?: string) => (value ? new Date(value) : undefined);

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

  /** outlet & kategori dari body harus milik bisnis ini (aturan multi-tenant). */
  private async assertRefs(business_id: string, dto: { outlet_id?: string; category_id?: string }) {
    if (dto.outlet_id) {
      const outlet = await this.prisma.outlet.findFirst({ where: { id: dto.outlet_id, business_id, deleted_at: null } });
      if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");
    }
    if (dto.category_id) {
      const category = await this.prisma.expenseCategory.findFirst({ where: { id: dto.category_id, business_id } });
      if (!category) throw new NotFoundException("Kategori pengeluaran tidak ditemukan");
    }
  }

  async create(business_id: string, userId: string, dto: CreateExpenseDto) {
    await this.assertRefs(business_id, dto);
    return this.prisma.expense.create({
      // Nominal dari JSON lewat string → Decimal, tidak pernah disimpan sebagai float.
      data: {
        ...dto,
        amount: new Prisma.Decimal(String(dto.amount)),
        expense_date: toDate(dto.expense_date),
        business_id,
        created_by: userId,
      },
      include: { category: { select: { name: true } } },
    });
  }

  async update(business_id: string, id: string, dto: UpdateExpenseDto) {
    await this.getOne(business_id, id);
    await this.assertRefs(business_id, dto);
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...dto,
        amount: dto.amount === undefined ? undefined : new Prisma.Decimal(String(dto.amount)),
        expense_date: toDate(dto.expense_date),
      },
      include: { category: { select: { name: true } } },
    });
  }

  // Tidak ada delete: `expenses` tidak punya kolom deleted_at di skema.
}
