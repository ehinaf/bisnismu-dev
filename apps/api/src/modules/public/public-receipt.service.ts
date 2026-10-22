import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";

const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

// Hanya kolom yang memang tercetak di struk — tanpa id internal, pelanggan, atau kasir.
const RECEIPT_SELECT = {
  transaction_number: true,
  transaction_type: true,
  status: true,
  created_at: true,
  completed_at: true,
  subtotal: true,
  discount_total: true,
  tax_total: true,
  service_charge_total: true,
  delivery_fee: true,
  rounding_adjustment: true,
  total: true,
  change_due: true,
  business: {
    select: { name: true, settings: { select: { receipt_header: true, receipt_footer: true } } },
  },
  outlet: { select: { name: true, address: true, phone: true } },
  items: {
    select: {
      item_name_snapshot: true,
      variant_name_snapshot: true,
      quantity: true,
      unit_price: true,
      subtotal: true,
      modifiers: { select: { modifier_name_snapshot: true } },
    },
  },
  payments: { select: { channel_name_snapshot: true, amount: true, is_receivable: true } },
  reference_transaction: { select: { transaction_number: true } },
} satisfies Prisma.TransactionSelect;

type ReceiptRow = Prisma.TransactionGetPayload<{ select: typeof RECEIPT_SELECT }>;

@Injectable()
export class PublicReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Struk untuk tautan publik (/r/:token, dibagikan lewat WhatsApp). Open bill
   * (belum dibayar) tidak punya struk.
   */
  async getReceipt(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new NotFoundException("Struk tidak ditemukan");

    const t = await this.prisma.transaction.findUnique({ where: { receipt_token: token }, select: RECEIPT_SELECT });
    return this.toView(t);
  }

  /**
   * Struk yang sama untuk dicetak dari aplikasi (kasir yang login) — lewat id +
   * business_id, tidak terkena throttle per-IP endpoint publik.
   */
  async getReceiptForBusiness(business_id: string, id: string) {
    const t = await this.prisma.transaction.findFirst({ where: { id, business_id }, select: RECEIPT_SELECT });
    return this.toView(t);
  }

  private toView(t: ReceiptRow | null) {
    if (!t || t.status === "open" || t.status === "pending") throw new NotFoundException("Struk tidak ditemukan");

    return {
      business_name: t.business.name,
      receipt_header: t.business.settings?.receipt_header ?? null,
      receipt_footer: t.business.settings?.receipt_footer ?? null,
      outlet: t.outlet,
      transaction_number: t.transaction_number,
      transaction_type: t.transaction_type,
      status: t.status,
      date: t.completed_at ?? t.created_at,
      reference_number: t.reference_transaction?.transaction_number ?? null,
      items: t.items.map((i) => ({
        name: i.item_name_snapshot,
        variant: i.variant_name_snapshot,
        modifiers: i.modifiers.map((m) => m.modifier_name_snapshot),
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.subtotal,
      })),
      subtotal: t.subtotal,
      discount_total: t.discount_total,
      tax_total: t.tax_total,
      service_charge_total: t.service_charge_total,
      delivery_fee: t.delivery_fee,
      rounding_adjustment: t.rounding_adjustment,
      total: t.total,
      change_due: t.change_due,
      payments: t.payments.map((p) => ({
        method: p.is_receivable ? "Kasbon" : p.channel_name_snapshot,
        amount: p.amount,
      })),
    };
  }
}
