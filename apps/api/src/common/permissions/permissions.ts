import type { user_role } from "@bisnismu/db";
import type { PrismaService } from "../../prisma/prisma.service";
import type { JwtPayload } from "../interfaces/jwt-payload.interface";

// Kunci izin granular (tabel user_permissions) yang melengkapi role dasar.
export const PERMISSIONS = {
  VOID_TRANSACTION: "void_transaction",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

// Role ini memegang semua izin; role lain (cashier/staff) butuh baris user_permissions.
export const PRIVILEGED_ROLES: user_role[] = ["owner", "admin", "manager"];

/**
 * Izin efektif user, dibaca dari DB tiap kali (bukan dari token) supaya
 * pencabutan izin langsung berlaku tanpa menunggu token kedaluwarsa.
 */
export async function effectivePermissions(prisma: PrismaService, user: JwtPayload): Promise<PermissionKey[]> {
  if (PRIVILEGED_ROLES.includes(user.role)) return ALL_PERMISSIONS;
  const rows = await prisma.userPermission.findMany({
    where: { user_id: user.sub, user: { business_id: user.business_id } },
    select: { permission_key: true },
  });
  return rows.map((r) => r.permission_key).filter((k): k is PermissionKey => ALL_PERMISSIONS.includes(k as PermissionKey));
}

export async function hasPermission(prisma: PrismaService, user: JwtPayload, key: PermissionKey): Promise<boolean> {
  return (await effectivePermissions(prisma, user)).includes(key);
}
