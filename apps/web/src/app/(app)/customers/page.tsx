"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Plus, Users } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { getUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import type { Customer } from "@/lib/types";

const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

interface FormState {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  address: string;
  credit_limit: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  phone: "",
  email: "",
  address: "",
  credit_limit: "0",
};

export default function CustomersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
      router.replace("/transactions");
      return;
    }
    setReady(true);
  }, [router]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      setCustomers(await apiClient.get<Customer[]>("/customers"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat pelanggan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready) loadAll();
  }, [ready]);

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEditForm(customer: Customer) {
    setForm({
      id: customer.id,
      name: customer.name ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      credit_limit: customer.credit_limit,
    });
    setFormOpen(true);
  }

  async function handleSubmit() {
    if (!form.name.trim() && !form.phone.trim()) {
      setError("Isi minimal nama atau nomor telepon.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : undefined,
      };
      if (form.id) {
        await apiClient.patch(`/customers/${form.id}`, payload);
      } else {
        await apiClient.post("/customers", payload);
      }
      setFormOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pelanggan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await apiClient.delete(`/customers/${pendingDelete.id}`);
      setPendingDelete(null);
      await loadAll();
    } catch (err) {
      setPendingDelete(null);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus pelanggan.");
    } finally {
      setDeleting(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={Users}
        title="Pelanggan"
        description="Data pelanggan, poin loyalti, dan kasbon"
        action={
          <Button onClick={openCreateForm}>
            <Plus className="h-4 w-4" /> Pelanggan Baru
          </Button>
        }
      />

      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Ubah Pelanggan" : "Pelanggan Baru"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nama</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Telepon</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="credit_limit">Batas Kasbon (Kredit)</Label>
                <Input
                  id="credit_limit"
                  type="number"
                  min={0}
                  value={form.credit_limit}
                  onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="address">Alamat</Label>
                <Input id="address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button disabled={saving} onClick={handleSubmit}>
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                Batal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Memuat pelanggan...</p>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Users className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <p className="text-sm text-muted-foreground">Belum ada pelanggan. Tambahkan pelanggan pertama Anda.</p>
              <Button size="sm" onClick={openCreateForm}>
                <Plus className="h-4 w-4" /> Pelanggan Baru
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Nama</th>
                    <th className="px-4 py-3 font-medium">Telepon</th>
                    <th className="px-4 py-3 text-right font-medium">Total Belanja</th>
                    <th className="px-4 py-3 text-right font-medium">Poin</th>
                    <th className="px-4 py-3 text-right font-medium">Limit Kasbon</th>
                    <th className="px-4 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <button
                          className="font-medium text-primary hover:underline"
                          onClick={() => router.push(`/customers/${c.id}`)}
                        >
                          {c.name ?? "(tanpa nama)"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "-"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(c.total_spent)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.loyalty_points}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(c.credit_limit)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => router.push(`/customers/${c.id}`)}>
                            Detail
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEditForm(c)}>
                            Ubah
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(c)}>
                            Hapus
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus pelanggan?"
        description={`"${pendingDelete?.name ?? pendingDelete?.phone ?? ""}" akan dihapus dari daftar pelanggan.`}
        confirmLabel="Hapus"
        destructive
        busy={deleting}
        onConfirm={handleDeactivate}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
