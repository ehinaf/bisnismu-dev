import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreatePriceTierDto } from "./dto/create-price-tier.dto";
import { UpdatePriceTierDto } from "./dto/update-price-tier.dto";

@Injectable()
export class PriceTierService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertItemInBusiness(business_id: string, item_id: string) {
    const item = await this.prisma.item.findFirst({ where: { id: item_id, business_id, deleted_at: null } });
    if (!item) throw new NotFoundException("Item tidak ditemukan");
    return item;
  }

  async list(business_id: string, item_id: string) {
    await this.assertItemInBusiness(business_id, item_id);
    return this.prisma.priceTier.findMany({ where: { item_id }, orderBy: { min_qty: "asc" } });
  }

  async create(business_id: string, item_id: string, dto: CreatePriceTierDto) {
    await this.assertItemInBusiness(business_id, item_id);
    return this.prisma.priceTier.create({ data: { ...dto, item_id } });
  }

  private async getOne(business_id: string, item_id: string, tierId: string) {
    await this.assertItemInBusiness(business_id, item_id);
    const tier = await this.prisma.priceTier.findFirst({ where: { id: tierId, item_id } });
    if (!tier) throw new NotFoundException("Tier harga tidak ditemukan");
    return tier;
  }

  async update(business_id: string, item_id: string, tierId: string, dto: UpdatePriceTierDto) {
    await this.getOne(business_id, item_id, tierId);
    return this.prisma.priceTier.update({ where: { id: tierId }, data: dto });
  }

  // Tidak ada delete: `price_tiers` tidak punya kolom deleted_at di skema
  // (sama seperti `units`/`expenses`/`dining_tables`). Nonaktifkan tier via
  // update min_qty/max_qty/price alih-alih menghapus barisnya.
}
