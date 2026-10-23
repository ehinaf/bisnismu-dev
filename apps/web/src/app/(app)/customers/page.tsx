"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { RowMenu } from "@/components/ui/row-menu";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/ui/page";
import { Plus, Search, Users } from "lucide-react";
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

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visibleCustomers = customers.filter(
    (c) => !q || [c.name, c.phone].some((v) => v?.toLowerCase().includes(q)),
  );

  function rowActions(c: Customer) {
    return [
      { label: "Detail & kasbon", onSelect: () => router.push(`/customers/${c.id}`) },
      { label: "Ubah", onSelect: () => openEditForm(c) },
      { label: "Hapus", onSelect: () => setPendingDelete(c), destructive: true },
    ];
  }

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
    <Page width="wide">
      <PageHeader
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
                <MoneyInput
                  id="credit_limit"
                  value={Number(form.credit_limit) || 0}
                  onValueChange={(v) => setForm((f) => ({ ...f, credit_limit: String(v) }))}
                  placeholder="0"
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

      {!loading && customers.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Cari pelanggan"
            placeholder="Cari nama atau telepon..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Memuat pelanggan...</p>
          ) : customers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Belum ada pelanggan"
              description="Simpan pelanggan langganan untuk kasbon dan riwayat belanja."
              action={
                <Button size="sm" onClick={openCreateForm}>
                  <Plus className="h-4 w-4" /> Pelanggan Baru
                </Button>
              }
            />
          ) : visibleCustomers.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Tidak ada pelanggan yang cocok.</p>
          ) : (
            <>
              {/* Desktop: tabel; klik baris = detail, aksi lain di menu ⋯ */}
              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Nama</th>
                    <th className="px-4 py-2.5 font-medium">Telepon</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total belanja</th>
                    <th className="px-4 py-2.5 text-right font-medium">Poin</th>
                    <th className="px-4 py-2.5 text-right font-medium">Limit kasbon</th>
                    <th className="w-12 px-2 py-2.5">
                      <span className="sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCustomers.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/customers/${c.id}`)}
                      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => router.push(`/customers/${c.id}`)}
                        >
                          {c.name ?? "(tanpa nama)"}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{c.phone ?? "-"}</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrency(c.total_spent)}</td>
                      <td className="px-4 py-2.5 text-right">{c.loyalty_points}</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrency(c.credit_limit)}</td>
                      <td className="px-2 py-1.5">
                        <RowMenu label={`Aksi ${c.name ?? c.phone ?? "pelanggan"}`} items={rowActions(c)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Ponsel: daftar ringkas */}
              <ul className="divide-y divide-border md:hidden">
                {visibleCustomers.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-1 pl-4 pr-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/customers/${c.id}`)}
                      className="min-w-0 flex-1 py-2 text-left"
                    >
                      <p className="truncate text-sm font-medium">{c.name ?? "(tanpa nama)"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.phone ?? "Tanpa telepon"} · belanja {formatCurrency(c.total_spent)}
                      </p>
                    </button>
                    <RowMenu label={`Aksi ${c.name ?? c.phone ?? "pelanggan"}`} items={rowActions(c)} />
                  </li>
                ))}
              </ul>
            </>
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
    </Page>
  );
}
