import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateDiscountDto } from "./dto/create-discount.dto";
import { UpdateDiscountDto } from "./dto/update-discount.dto";

@Injectable()
export class DiscountService {
  constructor(private readonly prisma: PrismaService) {}

  list(business_id: string) {
    return this.prisma.discount.findMany({ where: { business_id, deleted_at: null } });
  }

  async getOne(business_id: string, id: string) {
    const discount = await this.prisma.discount.findFirst({ where: { id, business_id, deleted_at: null } });
    if (!discount) throw new NotFoundException("Diskon tidak ditemukan");
    return discount;
  }

  create(business_id: string, dto: CreateDiscountDto) {
    return this.prisma.discount.create({
      data: {
        business_id,
        name: dto.name,
        discount_type: dto.discount_type,
        value: dto.value,
        scope: dto.scope,
        conditions: (dto.conditions ?? {}) as Prisma.InputJsonValue,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
        is_active: dto.is_active,
      },
    });
  }

  async update(business_id: string, id: string, dto: UpdateDiscountDto) {
    await this.getOne(business_id, id);
    return this.prisma.discount.update({
      where: { id },
      data: {
        name: dto.name,
        discount_type: dto.discount_type,
        value: dto.value,
        scope: dto.scope,
        conditions: dto.conditions as Prisma.InputJsonValue | undefined,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
        is_active: dto.is_active,
      },
    });
  }

  async softDelete(business_id: string, id: string) {
    await this.getOne(business_id, id);
    return this.prisma.discount.update({ where: { id }, data: { deleted_at: new Date() } });
  }
}
