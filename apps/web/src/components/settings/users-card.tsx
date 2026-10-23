"use client";

import { useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api-client";
import { PERMISSIONS } from "@/lib/hooks/use-permissions";
import { toast } from "@/lib/stores/toast-store";
import type { BusinessUser, UserRole } from "@/lib/types";

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Pemilik",
  admin: "Admin",
  manager: "Manajer",
  cashier: "Kasir",
  staff: "Staf",
};

const ROLE_HINTS: Partial<Record<UserRole, string>> = {
  admin: "Semua menu, termasuk Pengaturan",
  manager: "Katalog, stok, pelanggan, laporan, void & refund",
  cashier: "Kasir & laci kas",
  staff: "Akses sama dengan kasir",
};

// Peran ini selalu memegang semua izin (sama dengan PRIVILEGED_ROLES di API).
const PRIVILEGED_ROLES: UserRole[] = ["owner", "admin", "manager"];

// Sama dengan manageableRoles() di API (tenant/staff-roles.ts).
function manageableRoles(role: UserRole): UserRole[] {
  if (role === "owner") return ["admin", "manager", "cashier", "staff"];
  if (role === "admin") return ["manager", "cashier", "staff"];
  return [];
}

const PERMISSION_OPTIONS = [
  { key: PERMISSIONS.VOID_TRANSACTION, label: "Void transaksi", hint: "Membatalkan penjualan di shift yang masih buka" },
  { key: PERMISSIONS.REFUND_TRANSACTION, label: "Refund transaksi", hint: "Retur barang & mengembalikan uang" },
];

interface FormState {
  id: string | null;
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

const EMPTY_FORM: FormState = { id: null, name: "", email: "", password: "", role: "cashier" };

export function UsersCard({ currentUserId, currentRole }: { currentUserId: string; currentRole: UserRole }) {
  const [users, setUsers] = useState<BusinessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingPermission, setSavingPermission] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<BusinessUser | null>(null);
  const [pinUser, setPinUser] = useState<BusinessUser | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const allowedRoles = manageableRoles(currentRole);

  useEffect(() => {
    apiClient
      .get<BusinessUser[]>("/tenant/users")
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pengguna."))
      .finally(() => setLoading(false));
  }, []);

  function replaceUser(updated: BusinessUser) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  async function togglePermission(user: BusinessUser, key: string) {
    const previous = user.permissions;
    const next = previous.includes(key) ? previous.filter((p) => p !== key) : [...previous, key];
    const setPermissions = (permissions: string[]) =>
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, permissions } : u)));

    // Optimistis: centang langsung berubah, dikembalikan bila gagal disimpan.
    setPermissions(next);
    setSavingPermission(`${user.id}:${key}`);
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
      setSavingPermission(null);
    }
  }

  function openCreate() {
    setFormError(null);
    setForm({ ...EMPTY_FORM, role: allowedRoles.includes("cashier") ? "cashier" : allowedRoles[0] });
  }

  function openEdit(user: BusinessUser) {
    setFormError(null);
    setForm({ id: user.id, name: user.name, email: user.email ?? "", password: "", role: user.role });
  }

  async function handleSubmit() {
    if (!form) return;
    setFormError(null);
    if (form.name.trim().length < 2) return setFormError("Nama minimal 2 huruf.");
    if (!form.id && !form.email.trim()) return setFormError("Email wajib diisi untuk login.");
    if ((!form.id || form.password) && form.password.length < 8) {
      return setFormError("Password minimal 8 karakter.");
    }

    setSaving(true);
    try {
      if (form.id) {
        const self = form.id === currentUserId;
        const updated = await apiClient.patch<BusinessUser>(`/tenant/users/${form.id}`, {
          name: form.name.trim(),
          ...(self ? {} : { role: form.role }),
          ...(form.password ? { password: form.password } : {}),
        });
        replaceUser(updated);
        toast.success(form.password ? `${updated.name} diperbarui — password baru berlaku.` : `${updated.name} diperbarui.`);
      } else {
        const created = await apiClient.post<BusinessUser>("/tenant/users", {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        });
        setUsers((prev) => [...prev, created]);
        toast.success(`${created.name} ditambahkan. Ia bisa login dengan email & password tadi.`);
      }
      setForm(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan pengguna.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmToggleActive() {
    if (!pendingToggle) return;
    setSaving(true);
    try {
      const updated = await apiClient.patch<BusinessUser>(`/tenant/users/${pendingToggle.id}`, {
        is_active: !pendingToggle.is_active,
      });
      replaceUser(updated);
      toast.success(updated.is_active ? `${updated.name} diaktifkan lagi.` : `${updated.name} dinonaktifkan.`);
      setPendingToggle(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal mengubah status pengguna.");
    } finally {
      setSaving(false);
    }
  }

  function openPin(user: BusinessUser) {
    setPin("");
    setPinError(null);
    setPinUser(user);
  }

  async function handleSavePin() {
    if (!pinUser) return;
    setPinError(null);
    if (!/^\d{4,6}$/.test(pin)) return setPinError("PIN harus 4–6 digit angka.");
    setSaving(true);
    try {
      replaceUser(await apiClient.put<BusinessUser>(`/tenant/users/${pinUser.id}/pin`, { pin }));
      toast.success(`PIN ${pinUser.name} disimpan. Ia bisa masuk dengan PIN di perangkat kasir.`);
      setPinUser(null);
    } catch (err) {
      setPinError(err instanceof ApiError ? err.message : "Gagal menyimpan PIN.");
    } finally {
      setSaving(false);
    }
  }

  const editingSelf = form?.id === currentUserId;
  const roleOptions = form?.id && editingSelf ? [form.role] : allowedRoles;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Pengguna & Izin
          </CardTitle>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Pemilik, admin, dan manajer selalu boleh void & refund. Berikan izin khusus untuk kasir atau staf tertentu.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4" /> Tambah
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Memuat pengguna...</p>
        ) : error ? (
          <p className="mx-4 mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {users.map((user) => {
              const privileged = PRIVILEGED_ROLES.includes(user.role);
              const self = user.id === currentUserId;
              const editable = self || allowedRoles.includes(user.role);
              return (
                <li key={user.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {user.name}
                      <Badge variant="muted">{ROLE_LABELS[user.role]}</Badge>
                      {self && <Badge variant="info">Anda</Badge>}
                      {!user.is_active && <Badge variant="danger">Nonaktif</Badge>}
                      {user.has_pin && <Badge variant="success">PIN aktif</Badge>}
                    </p>
                    {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
                    {editable && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" /> Ubah
                        </Button>
                        {!self && (
                          <Button size="sm" variant="outline" onClick={() => openPin(user)}>
                            <KeyRound className="h-3.5 w-3.5" /> {user.has_pin ? "Ganti PIN" : "Atur PIN"}
                          </Button>
                        )}
                        {!self && (
                          <Button size="sm" variant="ghost" onClick={() => setPendingToggle(user)}>
                            {user.is_active ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                        )}
                      </div>
                    )}
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
                              disabled={savingPermission === `${user.id}:${option.key}`}
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

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? "Ubah Pengguna" : "Tambah Pengguna"}>
        {form && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-name">Nama</Label>
              <Input
                id="user-name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-email">Email (untuk login)</Label>
              <Input
                id="user-email"
                type="email"
                autoComplete="off"
                value={form.email}
                disabled={!!form.id}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-role">Peran</Label>
              <Select
                id="user-role"
                value={form.role}
                disabled={editingSelf}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                    {ROLE_HINTS[role] ? ` — ${ROLE_HINTS[role]}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            {!editingSelf && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-password">{form.id ? "Password baru (kosongkan bila tidak diganti)" : "Password"}</Label>
                <Input
                  id="user-password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Minimal 8 karakter.{form.id ? " Mengganti password membuat pengguna ini keluar dari semua perangkat." : ""}
                </p>
              </div>
            )}
            {formError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={pinUser !== null} onClose={() => setPinUser(null)} title={`PIN ${pinUser?.name ?? ""}`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSavePin();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-pin">PIN baru (4–6 digit)</Label>
            <Input
              id="user-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="text-lg tracking-[0.5em]"
            />
            <p className="text-xs text-muted-foreground">
              Untuk masuk cepat di perangkat kasir. Tiap pengguna harus punya PIN berbeda; beri tahu PIN ini langsung ke
              orangnya.
            </p>
          </div>
          {pinError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{pinError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPinUser(null)}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan PIN"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingToggle !== null}
        title={pendingToggle?.is_active ? "Nonaktifkan pengguna?" : "Aktifkan pengguna?"}
        description={
          pendingToggle?.is_active
            ? `${pendingToggle.name} langsung keluar dari semua perangkat dan tidak bisa login sampai diaktifkan lagi. Riwayat transaksinya tetap tersimpan.`
            : `${pendingToggle?.name ?? ""} bisa login lagi dengan password lamanya.`
        }
        confirmLabel={pendingToggle?.is_active ? "Nonaktifkan" : "Aktifkan"}
        destructive={pendingToggle?.is_active}
        busy={saving}
        onConfirm={confirmToggleActive}
        onClose={() => setPendingToggle(null)}
      />
    </Card>
  );
}
