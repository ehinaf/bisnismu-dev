"use client";

import type { AuthUser } from "@/lib/auth";

// Panel "Kasir Aktif" di bagian bawah sidebar. Status shift (sesi kas/laci)
// disambungkan ke API cashdrawer pada tahap integrasi kas & laci.
export function ShiftPanel({ user }: { user: AuthUser | null }) {
  if (!user) return null;

  return (
    <div className="border-t border-zinc-800 px-4 py-3">
      <p className="text-xs text-zinc-500">Kasir Aktif</p>
      <p className="truncate text-sm font-semibold text-white">{user.name}</p>
    </div>
  );
}
