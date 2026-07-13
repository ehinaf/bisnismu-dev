import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  // Read-only: dipakai kasir untuk pratinjau pajak/service charge di panel
  // pembayaran. Perhitungan final tetap server-side saat transaksi disimpan.
  list(business_id: string) {
    return this.prisma.tax.findMany({
      where: { business_id, is_active: true },
      select: { id: true, name: true, rate: true, tax_kind: true },
      orderBy: { name: "asc" },
    });
  }
}
