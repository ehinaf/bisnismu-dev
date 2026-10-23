import { ConflictException } from "@nestjs/common";
import * as argon2 from "argon2";
import type { Prisma } from "@bisnismu/db";

/**
 * Login PIN mencari user dari PIN-nya, jadi PIN harus unik di antara user aktif
 * satu bisnis. Hash argon2 ber-salt tidak bisa dibuat UNIQUE di DB — dicek
 * dengan verify terhadap PIN user aktif lain.
 */
export async function assertPinAvailable(
  db: Prisma.TransactionClient,
  business_id: string,
  pin: string,
  exceptUserId: string,
) {
  const others = await db.user.findMany({
    where: { business_id, id: { not: exceptUserId }, deleted_at: null, is_active: true, pin_code: { not: null } },
    select: { pin_code: true },
  });
  for (const other of others) {
    if (other.pin_code && (await argon2.verify(other.pin_code, pin))) {
      throw new ConflictException("PIN ini sudah dipakai pengguna lain — pilih PIN lain");
    }
  }
}

// Batas percobaan untuk endpoint kredensial (login, PIN) — per IP.
export const CREDENTIAL_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

export function hashPin(pin: string) {
  return argon2.hash(pin, { type: argon2.argon2id });
}
