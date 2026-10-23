import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, writeAuditLog, type AuditActor } from "../../common/audit/audit-log";
import { CreateTaxDto } from "./dto/create-tax.dto";
import { UpdateTaxDto } from "./dto/update-tax.dto";

const TAX_SELECT = { id: true, name: true, rate: true, tax_kind: true, is_active: true } as const;

type TaxSnapshot = { name: string; rate: Prisma.Decimal; tax_kind: string; is_active: boolean };
const snapshot = (t: TaxSnapshot) => ({ name: t.name, rate: t.rate.toString(), tax_kind: t.tax_kind, is_active: t.is_active });

@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  // Kasir memakai yang aktif untuk pratinjau pajak/service charge (perhitungan
  // final tetap di server saat simpan); Pengaturan meminta semuanya.
  list(business_id: string, includeInactive = false) {
    return this.prisma.tax.findMany({
      where: { business_id, ...(includeInactive ? {} : { is_active: true }) },
      select: TAX_SELECT,
      orderBy: { name: "asc" },
    });
  }

  // Pajak mengubah total setiap transaksi berikutnya — perubahan dicatat di audit.
  async create(business_id: string, dto: CreateTaxDto, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const tax = await tx.tax.create({
        data: { business_id, name: dto.name, tax_kind: dto.tax_kind, rate: new Prisma.Decimal(String(dto.rate)) },
        select: TAX_SELECT,
      });
      await writeAuditLog(tx, {
        businessId: business_id,
        userId: actor.userId,
        action: AUDIT_ACTIONS.CREATE_TAX,
        entityType: "tax",
        entityId: tax.id,
        newValue: snapshot(tax),
        ip: actor.ip,
      });
      return tax;
    });
  }

  async update(business_id: string, id: string, dto: UpdateTaxDto, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.tax.findFirst({ where: { id, business_id }, select: TAX_SELECT });
      if (!before) throw new NotFoundException("Pajak tidak ditemukan");
      const tax = await tx.tax.update({
        where: { id },
        data: {
          name: dto.name,
          tax_kind: dto.tax_kind,
          is_active: dto.is_active,
          rate: dto.rate === undefined ? undefined : new Prisma.Decimal(String(dto.rate)),
        },
        select: TAX_SELECT,
      });
      await writeAuditLog(tx, {
        businessId: business_id,
        userId: actor.userId,
        action: AUDIT_ACTIONS.UPDATE_TAX,
        entityType: "tax",
        entityId: id,
        oldValue: snapshot(before),
        newValue: snapshot(tax),
        ip: actor.ip,
      });
      return tax;
    });
  }
}
