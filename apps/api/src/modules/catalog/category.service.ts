import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(business_id: string) {
    return this.prisma.category.findMany({
      where: { business_id, deleted_at: null },
      orderBy: { sort_order: "asc" },
    });
  }

  async getOne(business_id: string, id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, business_id, deleted_at: null } });
    if (!category) throw new NotFoundException("Kategori tidak ditemukan");
    return category;
  }

  create(business_id: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: { ...dto, business_id } });
  }

  async update(business_id: string, id: string, dto: UpdateCategoryDto) {
    await this.getOne(business_id, id);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async softDelete(business_id: string, id: string) {
    await this.getOne(business_id, id);
    return this.prisma.category.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });
  }
}
