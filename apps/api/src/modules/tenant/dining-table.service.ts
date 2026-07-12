import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateDiningTableDto } from "./dto/create-dining-table.dto";
import { UpdateDiningTableDto } from "./dto/update-dining-table.dto";

@Injectable()
export class DiningTableService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOutletInBusiness(business_id: string, outlet_id: string) {
    const outlet = await this.prisma.outlet.findFirst({ where: { id: outlet_id, business_id, deleted_at: null } });
    if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");
  }

  async list(business_id: string, outlet_id: string) {
    await this.assertOutletInBusiness(business_id, outlet_id);
    return this.prisma.diningTable.findMany({ where: { outlet_id }, orderBy: { name: "asc" } });
  }

  async create(business_id: string, outlet_id: string, dto: CreateDiningTableDto) {
    await this.assertOutletInBusiness(business_id, outlet_id);
    return this.prisma.diningTable.create({ data: { ...dto, outlet_id } });
  }

  private async getOne(business_id: string, outlet_id: string, id: string) {
    await this.assertOutletInBusiness(business_id, outlet_id);
    const table = await this.prisma.diningTable.findFirst({ where: { id, outlet_id } });
    if (!table) throw new NotFoundException("Meja tidak ditemukan");
    return table;
  }

  async update(business_id: string, outlet_id: string, id: string, dto: UpdateDiningTableDto) {
    await this.getOne(business_id, outlet_id, id);
    return this.prisma.diningTable.update({ where: { id }, data: dto });
  }

  // Tidak ada delete: `dining_tables` tidak punya deleted_at di skema, tapi
  // punya status='inactive' - dipakai sebagai mekanisme nonaktifkan meja
  // lewat update() alih-alih menghapus barisnya.
}
