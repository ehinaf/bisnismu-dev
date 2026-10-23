import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, writeAuditLog, type AuditActor } from "../../common/audit/audit-log";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";

// Selisih harga dari JSON lewat string → Decimal, tidak pernah disimpan sebagai float.
const toDecimal = (n: number | undefined) => (n === undefined ? undefined : new Prisma.Decimal(String(n)));

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
    return this.prisma.itemVariant.findMany({ where: { item_id, deleted_at: null }, orderBy: { name: "asc" } });
  }

  async create(business_id: string, item_id: string, dto: CreateVariantDto) {
    const item = await this.assertItemInBusiness(business_id, item_id);
    // Varian + baris inventory-nya dalam satu transaksi: tidak ada varian yang
    // bisa dijual tapi belum punya baris stok.
    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.itemVariant.create({
        data: {
          ...dto,
          price_adjustment: toDecimal(dto.price_adjustment),
          cost_adjustment: toDecimal(dto.cost_adjustment),
          item_id,
        },
      });
      // Samakan perlakuan dengan Item: varian baru juga dapat baris inventory
      // per outlet (stok 0) jika item induk melacak stok.
      if (item.track_stock) {
        const outlets = await tx.outlet.findMany({ where: { business_id, deleted_at: null } });
        if (outlets.length > 0) {
          await tx.inventory.createMany({
            data: outlets.map((outlet) => ({ outlet_id: outlet.id, item_id, variant_id: variant.id, quantity_on_hand: 0 })),
          });
        }
      }
      return variant;
    });
  }

  private async getOne(business_id: string, item_id: string, variantId: string) {
    await this.assertItemInBusiness(business_id, item_id);
    const variant = await this.prisma.itemVariant.findFirst({ where: { id: variantId, item_id, deleted_at: null } });
    if (!variant) throw new NotFoundException("Varian tidak ditemukan");
    return variant;
  }

  async update(business_id: string, item_id: string, variantId: string, dto: UpdateVariantDto, actor: AuditActor | null = null) {
    const existing = await this.getOne(business_id, item_id, variantId);
    const data = { ...dto, price_adjustment: toDecimal(dto.price_adjustment), cost_adjustment: toDecimal(dto.cost_adjustment) };
    const changed = (next: Prisma.Decimal | undefined, current: Prisma.Decimal) => next !== undefined && !next.equals(current);
    const priceChanged =
      changed(data.price_adjustment, existing.price_adjustment) || changed(data.cost_adjustment, existing.cost_adjustment);
    if (!priceChanged) return this.prisma.itemVariant.update({ where: { id: variantId }, data });

    // Ubah harga = aksi sensitif (CLAUDE.md #7), sama seperti harga item.
    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.itemVariant.update({ where: { id: variantId }, data });
      await writeAuditLog(tx, {
        businessId: business_id,
        userId: actor?.userId ?? null,
        action: AUDIT_ACTIONS.UPDATE_ITEM_PRICE,
        entityType: "item_variant",
        entityId: variantId,
        oldValue: {
          price_adjustment: existing.price_adjustment.toString(),
          cost_adjustment: existing.cost_adjustment.toString(),
        },
        newValue: {
          price_adjustment: variant.price_adjustment.toString(),
          cost_adjustment: variant.cost_adjustment.toString(),
        },
        ip: actor?.ip,
      });
      return variant;
    });
  }

  async softDelete(business_id: string, item_id: string, variantId: string) {
    await this.getOne(business_id, item_id, variantId);
    return this.prisma.itemVariant.update({
      where: { id: variantId },
      data: { deleted_at: new Date(), is_active: false },
    });
  }
}
