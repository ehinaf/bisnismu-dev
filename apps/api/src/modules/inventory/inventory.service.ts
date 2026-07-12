import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";

interface InventoryLockRow {
  id: string;
  quantity_on_hand: Prisma.Decimal | string;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOutletInBusiness(business_id: string, outlet_id: string) {
    const outlet = await this.prisma.outlet.findFirst({ where: { id: outlet_id, business_id, deleted_at: null } });
    if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");
    return outlet;
  }

  async list(business_id: string, outlet_id: string) {
    await this.assertOutletInBusiness(business_id, outlet_id);
    return this.prisma.inventory.findMany({
      where: { outlet_id },
      include: {
        item: { select: { name: true, sku: true, track_stock: true } },
        variant: { select: { name: true } },
      },
      orderBy: { item: { name: "asc" } },
    });
  }

  async lowStock(business_id: string, outlet_id: string) {
    await this.assertOutletInBusiness(business_id, outlet_id);
    return this.prisma.v_low_stock.findMany({ where: { business_id, outlet_id } });
  }

  async movements(business_id: string, outlet_id: string, item_id?: string) {
    await this.assertOutletInBusiness(business_id, outlet_id);
    return this.prisma.stockMovement.findMany({
      where: {
        inventory: {
          outlet_id,
          ...(item_id ? { item_id } : {}),
        },
      },
      include: { inventory: { select: { item: { select: { name: true } } } } },
      orderBy: { created_at: "desc" },
      take: 200,
    });
  }

  async adjust(business_id: string, userId: string, dto: AdjustInventoryDto) {
    return this.prisma.$transaction(async (tx) => {
      const outlet = await tx.outlet.findFirst({ where: { id: dto.outlet_id, business_id, deleted_at: null } });
      if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");

      const item = await tx.item.findFirst({ where: { id: dto.item_id, business_id, deleted_at: null } });
      if (!item) throw new NotFoundException("Item tidak ditemukan");

      const variantId = dto.variant_id ?? null;
      const rows = await tx.$queryRaw<InventoryLockRow[]>`
        SELECT id, quantity_on_hand FROM inventory
        WHERE outlet_id = ${dto.outlet_id} AND item_id = ${dto.item_id} AND variant_id IS NOT DISTINCT FROM ${variantId}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) {
        throw new NotFoundException(`Baris inventory untuk "${item.name}" belum terdaftar di outlet ini`);
      }

      const current = new Prisma.Decimal(row.quantity_on_hand);
      const newQuantity = new Prisma.Decimal(dto.new_quantity);
      const delta = newQuantity.minus(current);

      const updated = await tx.inventory.update({
        where: { id: row.id },
        data: { quantity_on_hand: newQuantity },
      });

      if (!delta.isZero()) {
        await tx.stockMovement.create({
          data: {
            inventory_id: row.id,
            movement_type: "adjustment",
            quantity: delta,
            reference_type: "manual",
            notes: dto.reason,
            created_by: userId,
          },
        });
      }

      return updated;
    });
  }
}
