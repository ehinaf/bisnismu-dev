"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  useEffect(() => {
    const user = getUser();
    if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
      router.replace("/dashboard");
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

  async function handleDeactivate(customer: Customer) {
    if (!confirm(`Hapus pelanggan "${customer.name ?? customer.phone}"?`)) return;
    setError(null);
    try {
      await apiClient.delete(`/customers/${customer.id}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus pelanggan.");
    }
  }

  if (!ready) return null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pelanggan</h1>
        <Button onClick={openCreateForm}>+ Pelanggan Baru</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

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
            <p className="p-4 text-sm text-muted-foreground">Belum ada pelanggan. Klik &quot;+ Pelanggan Baru&quot; untuk mulai.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Nama</th>
                    <th className="p-3 font-medium">Telepon</th>
                    <th className="p-3 text-right font-medium">Total Belanja</th>
                    <th className="p-3 text-right font-medium">Poin</th>
                    <th className="p-3 text-right font-medium">Limit Kasbon</th>
                    <th className="p-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="p-3">
                        <button
                          className="font-medium text-primary hover:underline"
                          onClick={() => router.push(`/customers/${c.id}`)}
                        >
                          {c.name ?? "(tanpa nama)"}
                        </button>
                      </td>
                      <td className="p-3">{c.phone ?? "-"}</td>
                      <td className="p-3 text-right">{formatCurrency(c.total_spent)}</td>
                      <td className="p-3 text-right">{c.loyalty_points}</td>
                      <td className="p-3 text-right">{formatCurrency(c.credit_limit)}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => router.push(`/customers/${c.id}`)}>
                            Detail
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEditForm(c)}>
                            Ubah
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeactivate(c)}>
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
    </div>
  );
}
