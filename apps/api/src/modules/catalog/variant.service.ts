import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";

@Injectable()
export class VariantService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertItemInBusiness(business_id: string, item_id: string) {
    const item = await this.prisma.item.findFirst({ where: { id: item_id, business_id, deleted_at: null } });
    if (!item) throw new NotFoundException("Item tidak ditemukan");
    return item;
  }

  async list(business_id: string, item_id: string) {
    await this.assertItemInBusiness(business_id, item_id);
    return this.prisma.itemVariant.findMany({ where: { item_id, deleted_at: null } });
  }

  async create(business_id: string, item_id: string, dto: CreateVariantDto) {
    await this.assertItemInBusiness(business_id, item_id);
    const variant = await this.prisma.itemVariant.create({ data: { ...dto, item_id } });

    // Samakan perlakuan dengan Item: varian baru juga dapat baris inventory
    // per outlet (stok 0) jika item induk melacak stok.
    const item = await this.prisma.item.findUniqueOrThrow({ where: { id: item_id } });
    if (item.track_stock) {
      const outlets = await this.prisma.outlet.findMany({ where: { business_id, deleted_at: null } });
      if (outlets.length > 0) {
        await this.prisma.inventory.createMany({
          data: outlets.map((outlet) => ({ outlet_id: outlet.id, item_id, variant_id: variant.id, quantity_on_hand: 0 })),
        });
      }
    }

    return variant;
  }

  private async getOne(business_id: string, item_id: string, variantId: string) {
    await this.assertItemInBusiness(business_id, item_id);
    const variant = await this.prisma.itemVariant.findFirst({ where: { id: variantId, item_id, deleted_at: null } });
    if (!variant) throw new NotFoundException("Varian tidak ditemukan");
    return variant;
  }

  async update(business_id: string, item_id: string, variantId: string, dto: UpdateVariantDto) {
    await this.getOne(business_id, item_id, variantId);
    return this.prisma.itemVariant.update({ where: { id: variantId }, data: dto });
  }

  async softDelete(business_id: string, item_id: string, variantId: string) {
    await this.getOne(business_id, item_id, variantId);
    return this.prisma.itemVariant.update({
      where: { id: variantId },
      data: { deleted_at: new Date(), is_active: false },
    });
  }
}
