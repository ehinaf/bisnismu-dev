import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, writeAuditLog } from "../../common/audit/audit-log";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";
import { UpdateReorderLevelDto } from "./dto/update-reorder-level.dto";

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

  /**
   * Stok per outlet untuk halaman Stok: hanya item yang melacak stok dan belum
   * dihapus. Item bervarian dijual per varian, jadi baris induknya (variant_id
   * NULL) disembunyikan — yang tampil baris tiap varian aktif.
   */
  async list(business_id: string, outlet_id: string) {
    await this.assertOutletInBusiness(business_id, outlet_id);
    const rows = await this.prisma.inventory.findMany({
      where: {
        outlet_id,
        item: { business_id, track_stock: true, deleted_at: null },
        OR: [{ variant_id: null }, { variant: { deleted_at: null } }],
      },
      include: {
        item: {
          select: {
            name: true,
            sku: true,
            unit: { select: { symbol: true, allow_decimal: true } },
            _count: { select: { variants: { where: { deleted_at: null } } } },
          },
        },
        variant: { select: { name: true } },
      },
      orderBy: [{ item: { name: "asc" } }, { variant: { name: "asc" } }],
    });
    return rows
      .filter((r) => r.variant_id !== null || r.item._count.variants === 0)
      .map((r) => ({
        id: r.id,
        item_id: r.item_id,
        variant_id: r.variant_id,
        item_name: r.item.name,
        variant_name: r.variant?.name ?? null,
        sku: r.item.sku,
        unit_symbol: r.item.unit?.symbol ?? null,
        allow_decimal: r.item.unit?.allow_decimal ?? false,
        quantity_on_hand: r.quantity_on_hand,
        reorder_level: r.reorder_level,
        updated_at: r.updated_at,
      }));
  }

  async updateReorderLevel(business_id: string, dto: UpdateReorderLevelDto) {
    await this.assertOutletInBusiness(business_id, dto.outlet_id);
    const row = await this.prisma.inventory.findFirst({
      where: {
        outlet_id: dto.outlet_id,
        item_id: dto.item_id,
        variant_id: dto.variant_id ?? null,
        item: { business_id, deleted_at: null },
      },
      select: { id: true },
    });
    if (!row) throw new NotFoundException("Baris stok tidak ditemukan");
    return this.prisma.inventory.update({
      where: { id: row.id },
      data: { reorder_level: new Prisma.Decimal(String(dto.reorder_level)) },
      select: { id: true, reorder_level: true },
    });
  }

  /** Stok ≤ batas minimum (termasuk yang habis) — sama dengan baris di halaman Stok. */
  async lowStock(business_id: string, outlet_id: string) {
    const rows = await this.list(business_id, outlet_id);
    return rows.filter((r) => r.quantity_on_hand.lessThanOrEqualTo(r.reorder_level));
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
      include: {
        inventory: { select: { item: { select: { name: true } }, variant: { select: { name: true } } } },
        creator: { select: { name: true } },
      },
      orderBy: { created_at: "desc" },
      take: 200,
    });
  }

  async adjust(business_id: string, userId: string, dto: AdjustInventoryDto, ip: string | null = null) {
    if ((dto.new_quantity === undefined) === (dto.delta === undefined)) {
      throw new BadRequestException("Isi salah satu: jumlah akhir atau perubahan stok");
    }
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
      const newQuantity =
        dto.delta !== undefined
          ? current.plus(new Prisma.Decimal(String(dto.delta)))
          : new Prisma.Decimal(String(dto.new_quantity));
      if (newQuantity.isNegative()) {
        throw new BadRequestException(`Stok "${item.name}" tidak cukup untuk dikurangi (tersedia ${current.toString()})`);
      }
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
        await writeAuditLog(tx, {
          businessId: business_id,
          userId,
          action: AUDIT_ACTIONS.ADJUST_STOCK,
          entityType: "inventory",
          entityId: row.id,
          oldValue: { quantity_on_hand: current.toString() },
          newValue: { quantity_on_hand: newQuantity.toString(), reason: dto.reason },
          ip,
        });
      }

      return updated;
    });
  }
}
