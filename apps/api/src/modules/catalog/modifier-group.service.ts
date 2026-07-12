import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateModifierGroupDto } from "./dto/create-modifier-group.dto";
import { UpdateModifierGroupDto } from "./dto/update-modifier-group.dto";

@Injectable()
export class ModifierGroupService {
  constructor(private readonly prisma: PrismaService) {}

  list(business_id: string) {
    return this.prisma.modifierGroup.findMany({
      where: { business_id, deleted_at: null },
      include: { modifiers: true },
    });
  }

  async getOne(business_id: string, id: string) {
    const group = await this.prisma.modifierGroup.findFirst({
      where: { id, business_id, deleted_at: null },
      include: { modifiers: true },
    });
    if (!group) throw new NotFoundException("Grup modifier tidak ditemukan");
    return group;
  }

  create(business_id: string, dto: CreateModifierGroupDto) {
    return this.prisma.modifierGroup.create({ data: { ...dto, business_id } });
  }

  async update(business_id: string, id: string, dto: UpdateModifierGroupDto) {
    await this.assertExists(business_id, id);
    return this.prisma.modifierGroup.update({ where: { id }, data: dto });
  }

  async softDelete(business_id: string, id: string) {
    await this.assertExists(business_id, id);
    return this.prisma.modifierGroup.update({ where: { id }, data: { deleted_at: new Date() } });
  }

  private async assertExists(business_id: string, id: string) {
    const group = await this.prisma.modifierGroup.findFirst({ where: { id, business_id, deleted_at: null } });
    if (!group) throw new NotFoundException("Grup modifier tidak ditemukan");
    return group;
  }
}
