import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ItemModifierGroupService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertItemInBusiness(business_id: string, item_id: string) {
    const item = await this.prisma.item.findFirst({ where: { id: item_id, business_id, deleted_at: null } });
    if (!item) throw new NotFoundException("Item tidak ditemukan");
    return item;
  }

  private async assertGroupInBusiness(business_id: string, groupId: string) {
    const group = await this.prisma.modifierGroup.findFirst({
      where: { id: groupId, business_id, deleted_at: null },
    });
    if (!group) throw new NotFoundException("Grup modifier tidak ditemukan");
    return group;
  }

  async list(business_id: string, item_id: string) {
    await this.assertItemInBusiness(business_id, item_id);
    return this.prisma.itemModifierGroup.findMany({
      where: { item_id },
      include: { modifier_group: { include: { modifiers: true } } },
    });
  }

  async attach(business_id: string, item_id: string, groupId: string) {
    await this.assertItemInBusiness(business_id, item_id);
    await this.assertGroupInBusiness(business_id, groupId);

    const existing = await this.prisma.itemModifierGroup.findUnique({
      where: { item_id_modifier_group_id: { item_id, modifier_group_id: groupId } },
    });
    if (existing) throw new ConflictException("Grup modifier ini sudah terpasang di item ini");

    return this.prisma.itemModifierGroup.create({ data: { item_id, modifier_group_id: groupId } });
  }

  async detach(business_id: string, item_id: string, groupId: string) {
    await this.assertItemInBusiness(business_id, item_id);
    await this.assertGroupInBusiness(business_id, groupId);

    const existing = await this.prisma.itemModifierGroup.findUnique({
      where: { item_id_modifier_group_id: { item_id, modifier_group_id: groupId } },
    });
    if (!existing) throw new NotFoundException("Grup modifier ini belum terpasang di item ini");

    await this.prisma.itemModifierGroup.delete({
      where: { item_id_modifier_group_id: { item_id, modifier_group_id: groupId } },
    });
  }
}
