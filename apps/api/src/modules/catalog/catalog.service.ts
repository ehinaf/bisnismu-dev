import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listItems(business_id: string) {
    return this.prisma.item.findMany({
      where: { business_id, is_active: true, deleted_at: null },
      orderBy: { name: "asc" },
    });
  }
}
