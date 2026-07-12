import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
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

  async update(business_id: string, id: string, dto: UpdateItemDto) {
    await this.getOne(business_id, id);
    return this.prisma.item.update({ where: { id }, data: dto });
  }

  async softDelete(business_id: string, id: string) {
    await this.getOne(business_id, id);
    return this.prisma.item.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });
  }
}
