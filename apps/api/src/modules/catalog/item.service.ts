import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, writeAuditLog, type AuditActor } from "../../common/audit/audit-log";
import { CreateItemDto } from "./dto/create-item.dto";
import { UpdateItemDto } from "./dto/update-item.dto";

@Injectable()
export class ItemService {
  constructor(private readonly prisma: PrismaService) {}

  list(business_id: string) {
    return this.prisma.item.findMany({
      where: { business_id, is_active: true, deleted_at: null },
      orderBy: { name: "asc" },
    });
  }

  async getOne(business_id: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, business_id, deleted_at: null },
      include: { variants: { where: { deleted_at: null } } },
    });
    if (!item) throw new NotFoundException("Item tidak ditemukan");
    return item;
  }

  async create(business_id: string, dto: CreateItemDto) {
    const item = await this.prisma.item.create({ data: { ...dto, business_id } });

    // Item baru otomatis dapat baris inventory (stok 0) di semua outlet bisnis ini,
    // supaya langsung bisa dijual setelah stok diisi lewat modul inventory —
    // tanpa ini, penjualan pertama akan gagal dengan "stok belum terdaftar".
    if (item.track_stock) {
      const outlets = await this.prisma.outlet.findMany({ where: { business_id, deleted_at: null } });
      if (outlets.length > 0) {
        await this.prisma.inventory.createMany({
          data: outlets.map((outlet) => ({ outlet_id: outlet.id, item_id: item.id, quantity_on_hand: 0 })),
        });
      }
    }

    return item;
  }

  async update(business_id: string, id: string, dto: UpdateItemDto, actor: AuditActor | null = null) {
    const existing = await this.getOne(business_id, id);
    const changed = (next: number | undefined, current: Prisma.Decimal) =>
      next !== undefined && !new Prisma.Decimal(next).equals(current);
    const priceChanged = changed(dto.base_price, existing.base_price) || changed(dto.cost_price, existing.cost_price);
    if (!priceChanged) return this.prisma.item.update({ where: { id }, data: dto });

    // Ubah harga = aksi sensitif (CLAUDE.md #7): update & jejak audit dalam satu transaksi.
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.item.update({ where: { id }, data: dto });
      await writeAuditLog(tx, {
        businessId: business_id,
        userId: actor?.userId ?? null,
        action: AUDIT_ACTIONS.UPDATE_ITEM_PRICE,
        entityType: "item",
        entityId: id,
        oldValue: { base_price: existing.base_price.toString(), cost_price: existing.cost_price.toString() },
        newValue: { base_price: item.base_price.toString(), cost_price: item.cost_price.toString() },
        ip: actor?.ip,
      });
      return item;
    });
  }

  async softDelete(business_id: string, id: string) {
    await this.getOne(business_id, id);
    return this.prisma.item.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });
  }
}
