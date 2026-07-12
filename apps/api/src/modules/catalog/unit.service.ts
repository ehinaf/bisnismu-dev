import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUnitDto } from "./dto/create-unit.dto";
import { UpdateUnitDto } from "./dto/update-unit.dto";

@Injectable()
export class UnitService {
  constructor(private readonly prisma: PrismaService) {}

  list(business_id: string) {
    return this.prisma.unit.findMany({ where: { business_id }, orderBy: { name: "asc" } });
  }

  async getOne(business_id: string, id: string) {
    const unit = await this.prisma.unit.findFirst({ where: { id, business_id } });
    if (!unit) throw new NotFoundException("Satuan tidak ditemukan");
    return unit;
  }

  create(business_id: string, dto: CreateUnitDto) {
    return this.prisma.unit.create({ data: { ...dto, business_id } });
  }

  async update(business_id: string, id: string, dto: UpdateUnitDto) {
    await this.getOne(business_id, id);
    return this.prisma.unit.update({ where: { id }, data: dto });
  }

  // Tidak ada delete: tabel `units` tidak punya kolom deleted_at di skema,
  // dan hard delete melanggar aturan wajib soft-delete (CLAUDE.md #5).
}
