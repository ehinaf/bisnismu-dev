import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateOutletDto } from "./dto/create-outlet.dto";
import { UpdateOutletDto } from "./dto/update-outlet.dto";

@Injectable()
export class OutletService {
  constructor(private readonly prisma: PrismaService) {}

  list(business_id: string) {
    return this.prisma.outlet.findMany({
      where: { business_id, deleted_at: null },
      orderBy: { created_at: "asc" },
    });
  }

  async getOne(business_id: string, id: string) {
    const outlet = await this.prisma.outlet.findFirst({
      where: { id, business_id, deleted_at: null },
    });
    if (!outlet) {
      throw new NotFoundException("Outlet tidak ditemukan");
    }
    return outlet;
  }

  /**
   * Outlet baru langsung bisa menjual: setiap item yang melacak stok — dan
   * tiap variannya — mendapat baris inventory stok 0 (sama seperti item/varian
   * baru mendapat baris di semua outlet). Tanpa ini penjualan pertama gagal
   * "stok belum terdaftar".
   */
  create(business_id: string, dto: CreateOutletDto) {
    return this.prisma.$transaction(async (tx) => {
      const outlet = await tx.outlet.create({ data: { ...dto, business_id } });
      const items = await tx.item.findMany({
        where: { business_id, track_stock: true, deleted_at: null },
        select: { id: true, variants: { where: { deleted_at: null }, select: { id: true } } },
      });
      const rows = items.flatMap((item) => [
        { outlet_id: outlet.id, item_id: item.id, variant_id: null, quantity_on_hand: 0 },
        ...item.variants.map((v) => ({ outlet_id: outlet.id, item_id: item.id, variant_id: v.id, quantity_on_hand: 0 })),
      ]);
      if (rows.length > 0) await tx.inventory.createMany({ data: rows });
      return outlet;
    });
  }

  /** Bisnis tanpa outlet aktif tidak bisa membuka laci kas maupun berjualan. */
  private async assertNotLastActive(business_id: string, id: string) {
    const others = await this.prisma.outlet.count({
      where: { business_id, deleted_at: null, is_active: true, id: { not: id } },
    });
    if (others === 0) {
      throw new BadRequestException("Minimal satu outlet harus aktif");
    }
  }

  async update(business_id: string, id: string, dto: UpdateOutletDto) {
    await this.getOne(business_id, id);
    if (dto.is_active === false) await this.assertNotLastActive(business_id, id);
    return this.prisma.outlet.update({
      where: { id },
      data: dto,
    });
  }

  async softDelete(business_id: string, id: string) {
    await this.getOne(business_id, id);
    await this.assertNotLastActive(business_id, id);
    return this.prisma.outlet.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });
  }
}
