"use client";

import { useEffect, useState } from "react";
import { Settings, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { apiClient, ApiError } from "@/lib/api-client";
import { getUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/hooks/use-permissions";
import { toast } from "@/lib/stores/toast-store";
import type { BusinessUser } from "@/lib/types";

const ROLE_LABELS: Record<BusinessUser["role"], string> = {
  owner: "Pemilik",
  admin: "Admin",
  manager: "Manajer",
  cashier: "Kasir",
  staff: "Staf",
};

// Peran ini selalu memegang semua izin (sama dengan PRIVILEGED_ROLES di API).
const PRIVILEGED_ROLES: BusinessUser["role"][] = ["owner", "admin", "manager"];

const PERMISSION_OPTIONS = [
  { key: PERMISSIONS.VOID_TRANSACTION, label: "Void transaksi", hint: "Membatalkan penjualan di shift yang masih buka" },
  { key: PERMISSIONS.REFUND_TRANSACTION, label: "Refund transaksi", hint: "Retur barang & mengembalikan uang" },
];

export default function SettingsPage() {
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [users, setUsers] = useState<BusinessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const role = getUser()?.role;
    const allowed = role === "owner" || role === "admin";
    setCanManage(allowed);
    if (!allowed) {
      setLoading(false);
      return;
    }
    apiClient
      .get<BusinessUser[]>("/tenant/users")
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pengguna."))
      .finally(() => setLoading(false));
  }, []);

  async function togglePermission(user: BusinessUser, key: string) {
    const previous = user.permissions;
    const next = previous.includes(key) ? previous.filter((p) => p !== key) : [...previous, key];
    const setPermissions = (permissions: string[]) =>
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, permissions } : u)));

    // Optimistis: centang langsung berubah, dikembalikan bila gagal disimpan.
    setPermissions(next);
    setSaving(`${user.id}:${key}`);
    try {
      const result = await apiClient.put<{ permissions: string[] }>(`/tenant/users/${user.id}/permissions`, {
        permissions: next,
      });
      setPermissions(result.permissions);
      toast.success(`Izin ${user.name} diperbarui.`);
    } catch (err) {
      setPermissions(previous);
      toast.error(err instanceof ApiError ? err.message : "Gagal menyimpan izin.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader icon={Settings} title="Pengaturan" description="Pengguna & izin — pengaturan bisnis lainnya menyusul" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Izin Pengguna
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Pemilik, admin, dan manajer selalu boleh void & refund. Berikan izin khusus untuk kasir atau staf tertentu.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {canManage === false ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">Hanya pemilik atau admin yang dapat mengatur izin pengguna.</p>
          ) : loading ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">Memuat pengguna...</p>
          ) : error ? (
            <p className="mx-4 mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {users.map((user) => {
                const privileged = PRIVILEGED_ROLES.includes(user.role);
                return (
                  <li key={user.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {user.name}
                        <Badge variant="muted">{ROLE_LABELS[user.role]}</Badge>
                        {!user.is_active && <Badge variant="danger">Nonaktif</Badge>}
                      </p>
                      {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
                    </div>
                    {privileged ? (
                      <p className="text-sm text-muted-foreground">Semua izin (peran {ROLE_LABELS[user.role].toLowerCase()})</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {PERMISSION_OPTIONS.map((option) => {
                          const id = `perm-${user.id}-${option.key}`;
                          return (
                            <label key={option.key} htmlFor={id} className="flex items-start gap-2 text-sm">
                              <input
                                id={id}
                                type="checkbox"
                                className="mt-0.5 h-4 w-4"
                                checked={user.permissions.includes(option.key)}
                                disabled={saving === `${user.id}:${option.key}`}
                                onChange={() => togglePermission(user, option.key)}
                              />
                              <span>
                                {option.label}
                                <span className="block text-xs text-muted-foreground">{option.hint}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">Pengaturan pajak, pembulatan, dan struk — segera hadir.</p>
    </div>
  );
}
