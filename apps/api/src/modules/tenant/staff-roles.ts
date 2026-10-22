import type { user_role } from "@bisnismu/db";

// Peran yang bisa dibuat/diberikan dari Pengaturan — owner hanya lahir dari registrasi.
export const STAFF_ROLES = ["admin", "manager", "cashier", "staff"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Owner mengatur semua peran staf; admin tidak bisa membuat/mengatur sesama admin. */
export function manageableRoles(actorRole: user_role): readonly user_role[] {
  if (actorRole === "owner") return STAFF_ROLES;
  if (actorRole === "admin") return ["manager", "cashier", "staff"];
  return [];
}
