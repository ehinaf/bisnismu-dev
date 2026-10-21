import { isIP } from "node:net";
import type { Prisma } from "@bisnismu/db";

export const AUDIT_ACTIONS = {
  VOID_TRANSACTION: "void_transaction",
  CANCEL_OPEN_BILL: "cancel_open_bill",
  UPDATE_ITEM_PRICE: "update_item_price",
  ADJUST_STOCK: "adjust_stock",
  UPDATE_USER_PERMISSIONS: "update_user_permissions",
  SET_PIN: "set_pin",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// Siapa yang melakukan aksi — diteruskan controller ke service (user dari JWT, IP request).
export interface AuditActor {
  userId: string;
  ip?: string | null;
}

export interface AuditEntry {
  businessId: string;
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ip?: string | null;
}

/**
 * Catat aksi sensitif ke audit_logs (CLAUDE.md aturan #7). Selalu dipanggil
 * dengan client transaksi yang SAMA dengan aksinya — log dan aksi commit atau
 * rollback bersama, tidak pernah ada aksi tanpa jejak atau jejak tanpa aksi.
 */
export function writeAuditLog(tx: Prisma.TransactionClient, entry: AuditEntry) {
  return tx.auditLog.create({
    data: {
      business_id: entry.businessId,
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      old_value: entry.oldValue,
      new_value: entry.newValue,
      // Kolom bertipe INET — nilai yang bukan alamat IP valid ditolak Postgres.
      ip_address: entry.ip && isIP(entry.ip) ? entry.ip : null,
    },
  });
}
