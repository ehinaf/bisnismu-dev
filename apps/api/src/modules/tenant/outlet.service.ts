import { Injectable, NotFoundException } from "@nestjs/common";
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

  create(business_id: string, dto: CreateOutletDto) {
    return this.prisma.outlet.create({
      data: { ...dto, business_id },
    });
  }

  async update(business_id: string, id: string, dto: UpdateOutletDto) {
    await this.getOne(business_id, id);
    return this.prisma.outlet.update({
      where: { id },
      data: dto,
    });
  }

  async softDelete(business_id: string, id: string) {
    await this.getOne(business_id, id);
    return this.prisma.outlet.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });
  }
}
