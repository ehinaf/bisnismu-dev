import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateExpenseCategoryDto } from "./dto/create-expense-category.dto";
import { UpdateExpenseCategoryDto } from "./dto/update-expense-category.dto";

@Injectable()
export class ExpenseCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(business_id: string) {
    return this.prisma.expenseCategory.findMany({ where: { business_id }, orderBy: { name: "asc" } });
  }

  async getOne(business_id: string, id: string) {
    const category = await this.prisma.expenseCategory.findFirst({ where: { id, business_id } });
    if (!category) throw new NotFoundException("Kategori pengeluaran tidak ditemukan");
    return category;
  }

  create(business_id: string, dto: CreateExpenseCategoryDto) {
    return this.prisma.expenseCategory.create({ data: { ...dto, business_id } });
  }

  async update(business_id: string, id: string, dto: UpdateExpenseCategoryDto) {
    await this.getOne(business_id, id);
    return this.prisma.expenseCategory.update({ where: { id }, data: dto });
  }

  // Tidak ada delete: `expense_categories` tidak punya kolom deleted_at di skema.
}
