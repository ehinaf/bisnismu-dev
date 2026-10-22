import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, writeAuditLog, type AuditActor } from "../../common/audit/audit-log";
import { CreatePaymentChannelDto } from "./dto/create-payment-channel.dto";
import { UpdatePaymentChannelDto } from "./dto/update-payment-channel.dto";

// Angka dari JSON diubah lewat string supaya tidak membawa error float ke NUMERIC.
const toDecimal = (n: number | undefined) => (n === undefined ? undefined : new Prisma.Decimal(String(n)));

const AUDITED_FIELDS = ["name", "channel_type", "fee_percentage", "fee_fixed", "is_active"] as const;

@Injectable()
export class PaymentChannelService {
  constructor(private readonly prisma: PrismaService) {}

  /** Kasir hanya melihat yang aktif; halaman Pengaturan meminta semuanya. */
  list(business_id: string, includeInactive = false) {
    return this.prisma.paymentChannel.findMany({
      where: { business_id, ...(includeInactive ? {} : { is_active: true }) },
      orderBy: [{ sort_order: "asc" }, { name: "asc" }],
    });
  }

  async create(business_id: string, dto: CreatePaymentChannelDto, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const sort_order =
        dto.sort_order ??
        ((await tx.paymentChannel.aggregate({ where: { business_id }, _max: { sort_order: true } }))._max.sort_order ??
          0) + 1;
      const channel = await tx.paymentChannel.create({
        data: {
          business_id,
          name: dto.name,
          channel_type: dto.channel_type,
          fee_percentage: toDecimal(dto.fee_percentage),
          fee_fixed: toDecimal(dto.fee_fixed),
          sort_order,
        },
      });
      await writeAuditLog(tx, {
        businessId: business_id,
        userId: actor.userId,
        action: AUDIT_ACTIONS.CREATE_PAYMENT_CHANNEL,
        entityType: "payment_channel",
        entityId: channel.id,
        newValue: this.auditSnapshot(channel),
        ip: actor.ip,
      });
      return channel;
    });
  }

  async update(business_id: string, id: string, dto: UpdatePaymentChannelDto, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      // Kunci semua channel bisnis ini: dua admin yang bersamaan menonaktifkan dua
      // metode Tunai berbeda tidak boleh sama-sama lolos cek "Tunai terakhir".
      await tx.$queryRaw`SELECT id FROM payment_channels WHERE business_id = ${business_id}::uuid FOR UPDATE`;
      const before = await tx.paymentChannel.findFirst({ where: { id, business_id } });
      if (!before) throw new NotFoundException("Metode pembayaran tidak ditemukan");

      const channel = await tx.paymentChannel.update({
        where: { id },
        data: {
          name: dto.name,
          channel_type: dto.channel_type,
          fee_percentage: toDecimal(dto.fee_percentage),
          fee_fixed: toDecimal(dto.fee_fixed),
          sort_order: dto.sort_order,
          is_active: dto.is_active,
        },
      });

      // Laci kas, kembalian, dan refund tunai bergantung pada metode cash.
      const activeCash = await tx.paymentChannel.count({
        where: { business_id, is_active: true, channel_type: "cash" },
      });
      if (activeCash === 0) {
        throw new BadRequestException("Minimal satu metode Tunai harus aktif");
      }

      const oldValue = this.auditSnapshot(before);
      const newValue = this.auditSnapshot(channel);
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        await writeAuditLog(tx, {
          businessId: business_id,
          userId: actor.userId,
          action: AUDIT_ACTIONS.UPDATE_PAYMENT_CHANNEL,
          entityType: "payment_channel",
          entityId: id,
          oldValue,
          newValue,
          ip: actor.ip,
        });
      }
      return channel;
    });
  }

  /** Biaya MDR memengaruhi laba bersih — perubahannya dicatat sebagai string Decimal. */
  private auditSnapshot(c: Record<(typeof AUDITED_FIELDS)[number], unknown>) {
    return Object.fromEntries(
      AUDITED_FIELDS.map((f) => [f, c[f] instanceof Prisma.Decimal ? c[f].toString() : c[f]]),
    ) as Prisma.InputJsonObject;
  }
}
