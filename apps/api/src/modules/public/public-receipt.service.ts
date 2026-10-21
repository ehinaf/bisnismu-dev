import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

@Injectable()
export class PublicReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Struk untuk tautan publik (/r/:token, dibagikan lewat WhatsApp). Hanya data
   * yang memang tercetak di struk — tanpa id internal, data pelanggan, atau
   * kasir. Open bill (belum dibayar) tidak punya struk publik.
   */
  async getReceipt(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new NotFoundException("Struk tidak ditemukan");

    const t = await this.prisma.transaction.findUnique({
      where: { receipt_token: token },
      select: {
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
      },
    });
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
