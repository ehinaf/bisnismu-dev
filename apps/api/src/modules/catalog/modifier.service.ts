import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateModifierDto } from "./dto/create-modifier.dto";
import { UpdateModifierDto } from "./dto/update-modifier.dto";

@Injectable()
export class ModifierService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertGroupInBusiness(business_id: string, groupId: string) {
    const group = await this.prisma.modifierGroup.findFirst({
      where: { id: groupId, business_id, deleted_at: null },
    });
    if (!group) throw new NotFoundException("Grup modifier tidak ditemukan");
    return group;
  }

  async list(business_id: string, groupId: string) {
    await this.assertGroupInBusiness(business_id, groupId);
    return this.prisma.modifier.findMany({ where: { modifier_group_id: groupId } });
  }

  async create(business_id: string, groupId: string, dto: CreateModifierDto) {
    await this.assertGroupInBusiness(business_id, groupId);
    return this.prisma.modifier.create({ data: { ...dto, modifier_group_id: groupId } });
  }

  private async getOne(business_id: string, groupId: string, modifierId: string) {
    await this.assertGroupInBusiness(business_id, groupId);
    const modifier = await this.prisma.modifier.findFirst({ where: { id: modifierId, modifier_group_id: groupId } });
    if (!modifier) throw new NotFoundException("Modifier tidak ditemukan");
    return modifier;
  }

  async update(business_id: string, groupId: string, modifierId: string, dto: UpdateModifierDto) {
    await this.getOne(business_id, groupId, modifierId);
    return this.prisma.modifier.update({ where: { id: modifierId }, data: dto });
  }

  // Tidak ada delete: `modifiers` tidak punya kolom deleted_at di skema.
  // Nonaktifkan lewat update is_active=false (sama seperti pola price_tiers/units).
}
