"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Pencil, Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api-client";
import { getUser } from "@/lib/auth";
import { monthStartIso, todayIso } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { useActiveOutlet } from "@/lib/stores/outlet-store";
import { toast } from "@/lib/stores/toast-store";
import type { Expense, ExpenseCategory } from "@/lib/types";

const MANAGEMENT_ROLES = ["owner", "admin", "manager"];
const NEW_CATEGORY = "__new__";

interface FormState {
  id: string | null;
  expense_date: string;
  category_id: string;
  new_category: string;
  amount: number;
  description: string;
}

const emptyForm = (): FormState => ({
  id: null,
  expense_date: todayIso(),
  category_id: "",
  new_category: "",
  amount: 0,
  description: "",
});

// Pengeluaran dicatat per outlet aktif — laporan laba/rugi outlet hanya
// menghitung pengeluaran yang tercatat di outlet tersebut.
export default function ExpensesPage() {
  const router = useRouter();
  const outlet = useActiveOutlet();
  const [ready, setReady] = useState(false);
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
      router.replace("/transactions");
      return;
    }
    setReady(true);
    apiClient
      .get<ExpenseCategory[]>("/expenses/categories")
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [router]);

  const load = useCallback(async () => {
    if (!outlet || !from || !to) return;
    setError(null);
    try {
      setExpenses(await apiClient.get<Expense[]>(`/expenses?outlet_id=${outlet.id}&from=${from}&to=${to}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat pengeluaran.");
    } finally {
      setLoading(false);
    }
  }, [outlet, from, to]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    void load();
  }, [ready, load]);

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  function openCreate() {
    setFormError(null);
    setForm({ ...emptyForm(), category_id: categories[0]?.id ?? (categories.length === 0 ? NEW_CATEGORY : "") });
  }

  function openEdit(e: Expense) {
    setFormError(null);
    setForm({
      id: e.id,
      expense_date: e.expense_date.slice(0, 10),
      category_id: e.category_id ?? "",
      new_category: "",
      amount: Number(e.amount),
      description: e.description ?? "",
    });
  }

  async function handleSubmit() {
    if (!form || !outlet) return;
    setFormError(null);
    if (form.amount <= 0) return setFormError("Nominal harus lebih dari 0.");
    if (!form.expense_date) return setFormError("Tanggal wajib diisi.");
    if (form.category_id === NEW_CATEGORY && !form.new_category.trim()) {
      return setFormError("Isi nama kategori baru.");
    }

    setSaving(true);
    try {
      let categoryId = form.category_id || undefined;
      if (form.category_id === NEW_CATEGORY) {
        const created = await apiClient.post<ExpenseCategory>("/expenses/categories", { name: form.new_category.trim() });
        setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        categoryId = created.id;
      }
      const body = {
        outlet_id: outlet.id,
        category_id: categoryId,
        amount: form.amount,
        description: form.description.trim() || undefined,
        expense_date: form.expense_date,
      };
      if (form.id) await apiClient.patch(`/expenses/${form.id}`, body);
      else await apiClient.post("/expenses", body);
      toast.success(form.id ? "Pengeluaran diperbarui." : `Pengeluaran ${formatCurrency(form.amount)} dicatat.`);
      setForm(null);
      void load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan pengeluaran.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    if (!outlet) return;
    setExporting(true);
    try {
      const blob = await apiClient.download(`/reports/expenses/export?outlet_id=${outlet.id}&from=${from}&to=${to}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pengeluaran-${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal mengekspor CSV.");
    } finally {
      setExporting(false);
    }
  }

  if (!ready) return null;

  return (
    <Page width="wide">
      <PageHeader
        title="Pengeluaran"
        description={`Biaya operasional${outlet ? ` · ${outlet.name}` : ""} — mengurangi laba bersih di Laporan`}
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Catat
          </Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-from">Dari</Label>
            <Input id="expense-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-to">Sampai</Label>
            <Input id="expense-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!loading && !error && (
            <p className="text-sm text-muted-foreground">
              Total <span className="font-semibold tabular-nums text-foreground">{formatCurrency(total)}</span>
            </p>
          )}
          <Button variant="outline" size="sm" disabled={exporting || expenses.length === 0} onClick={handleExport}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Memuat pengeluaran...</p>
      ) : expenses.length === 0 && !error ? (
        <EmptyState
          icon={ReceiptText}
          title="Belum ada pengeluaran"
          description="Catat biaya seperti listrik, sewa, gas, atau belanja bahan supaya laba bersih akurat."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Catat pengeluaran
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.category?.name ?? "Tanpa kategori"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(`${e.expense_date.slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {e.description && ` · ${e.description}`}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatCurrency(e.amount)}</span>
                <Button size="sm" variant="ghost" onClick={() => openEdit(e)} aria-label={`Ubah pengeluaran ${e.category?.name ?? ""} ${formatCurrency(e.amount)}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? "Ubah Pengeluaran" : "Catat Pengeluaran"}>
        {form && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-amount">Nominal (Rp)</Label>
              <MoneyInput
                id="expense-amount"
                autoFocus
                placeholder="0"
                value={form.amount}
                onValueChange={(v) => setForm({ ...form, amount: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-date">Tanggal</Label>
                <Input
                  id="expense-date"
                  type="date"
                  value={form.expense_date}
                  max={todayIso()}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-category">Kategori</Label>
                <Select
                  id="expense-category"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">Tanpa kategori</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY}>+ Kategori baru…</option>
                </Select>
              </div>
            </div>
            {form.category_id === NEW_CATEGORY && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-new-category">Nama kategori baru</Label>
                <Input
                  id="expense-new-category"
                  placeholder="mis. Listrik, Sewa, Gas, Gaji"
                  maxLength={100}
                  value={form.new_category}
                  onChange={(e) => setForm({ ...form, new_category: e.target.value })}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-description">Keterangan (opsional)</Label>
              <Input
                id="expense-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Dibayar pakai uang laci? Catat juga sebagai Kas Keluar di menu Kas & Laci supaya saldo laci cocok saat tutup shift.
            </p>
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
    </Page>
  );
}
