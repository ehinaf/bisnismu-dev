"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export const PERMISSIONS = {
  VOID_TRANSACTION: "void_transaction",
} as const;

// Izin efektif dari server (GET /auth/me), hanya untuk menampilkan/menyembunyikan
// aksi di UI — server tetap memeriksa ulang setiap request. null = masih memuat.
export function usePermissions(): string[] | null {
  const [permissions, setPermissions] = useState<string[] | null>(null);

  useEffect(() => {
    apiClient
      .get<{ permissions: string[] }>("/auth/me")
      .then((me) => setPermissions(me.permissions))
      .catch(() => setPermissions([]));
  }, []);

  return permissions;
}
