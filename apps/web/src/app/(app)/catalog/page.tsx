"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/ui/page";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { RowMenu } from "@/components/ui/row-menu";
import { PackageOpen, Plus, Search } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { getUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { useActiveOutlet } from "@/lib/stores/outlet-store";
import { toast } from "@/lib/stores/toast-store";
import { VariantsSection } from "@/components/catalog/variants-section";
import type { Category, ItemDetail, ItemType, PricingType, Unit } from "@/lib/types";

const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  product: "Barang",
  service: "Jasa",
  bundle: "Paket/Bundle",
  ingredient: "Bahan Baku",
};

const PRICING_TYPE_LABEL: Record<PricingType, string> = {
  fixed: "Harga Tetap",
  per_unit: "Per Unit",
  per_duration: "Per Durasi",
  tiered: "Tier Grosir",
  open: "Harga Bebas (input manual saat jual)",
};

interface FormState {
  id: string | null;
  name: string;
  category_id: string;
  unit_id: string;
  sku: string;
  barcode: string;
  base_price: string;
  cost_price: string;
  item_type: ItemType;
  pricing_type: PricingType;
  track_stock: boolean;
  initial_stock: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  category_id: "",
  unit_id: "",
  sku: "",
  barcode: "",
  base_price: "",
  cost_price: "",
  item_type: "product",
  pricing_type: "fixed",
  track_stock: true,
  initial_stock: "0",
};

export default function CatalogPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // Stok awal produk baru dicatat di outlet yang dipilih di sidebar.
  const outlet = useActiveOutlet();
  const [items, setItems] = useState<ItemDetail[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pendingDeactivate, setPendingDeactivate] = useState<ItemDetail | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newUnit, setNewUnit] = useState({ name: "", symbol: "" });

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
      const [itemList, categoryList, unitList] = await Promise.all([
        apiClient.get<ItemDetail[]>("/catalog/items"),
        apiClient.get<Category[]>("/catalog/categories"),
        apiClient.get<Unit[]>("/catalog/units"),
      ]);
      setItems(itemList);
      setCategories(categoryList);
      setUnits(unitList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat data katalog.");
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

  function openEditForm(item: ItemDetail) {
    setForm({
      id: item.id,
      name: item.name,
      category_id: item.category_id ?? "",
      unit_id: item.unit_id ?? "",
      sku: item.sku ?? "",
      barcode: item.barcode ?? "",
      base_price: item.base_price,
      cost_price: item.cost_price,
      item_type: item.item_type,
      pricing_type: item.pricing_type,
      track_stock: item.track_stock,
      initial_stock: "0",
    });
    setFormOpen(true);
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    try {
      const category = await apiClient.post<Category>("/catalog/categories", { name: newCategoryName.trim() });
      setCategories((prev) => [...prev, category]);
      setForm((f) => ({ ...f, category_id: category.id }));
      setNewCategoryName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah kategori.");
    }
  }

  async function handleAddUnit() {
    if (!newUnit.name.trim() || !newUnit.symbol.trim()) return;
    try {
      const unit = await apiClient.post<Unit>("/catalog/units", { name: newUnit.name.trim(), symbol: newUnit.symbol.trim() });
      setUnits((prev) => [...prev, unit]);
      setForm((f) => ({ ...f, unit_id: unit.id }));
      setNewUnit({ name: "", symbol: "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah satuan.");
    }
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.base_price) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        category_id: form.category_id || undefined,
        unit_id: form.unit_id || undefined,
        sku: form.sku.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        base_price: Number(form.base_price),
        cost_price: form.cost_price ? Number(form.cost_price) : undefined,
        item_type: form.item_type,
        pricing_type: form.pricing_type,
        track_stock: form.track_stock,
      };

      let item: ItemDetail;
      if (form.id) {
        item = await apiClient.patch<ItemDetail>(`/catalog/items/${form.id}`, payload);
        toast.success(`${item.name} disimpan.`);
        setFormOpen(false);
      } else {
        item = await apiClient.post<ItemDetail>("/catalog/items", payload);
        const initialStock = Number(form.initial_stock);
        if (form.track_stock && outlet && initialStock > 0) {
          await apiClient.post("/inventory/adjust", {
            outlet_id: outlet.id,
            item_id: item.id,
            new_quantity: initialStock,
            reason: "Stok awal saat produk dibuat",
          });
        }
        // Form tetap terbuka dalam mode ubah supaya varian bisa langsung ditambahkan.
        setForm((f) => ({ ...f, id: item.id, initial_stock: "0" }));
        toast.success(`${item.name} dibuat. Tambahkan varian bila ada ukuran/rasa, atau tutup form.`);
      }

      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan produk.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!pendingDeactivate) return;
    setDeactivating(true);
    setError(null);
    try {
      await apiClient.delete(`/catalog/items/${pendingDeactivate.id}`);
      setPendingDeactivate(null);
      await loadAll();
    } catch (err) {
      setPendingDeactivate(null);
      setError(err instanceof ApiError ? err.message : "Gagal menonaktifkan produk.");
    } finally {
      setDeactivating(false);
    }
  }

  function categoryName(id: string | null) {
    return categories.find((c) => c.id === id)?.name ?? "Tanpa kategori";
  }

  function rowActions(item: ItemDetail) {
    return [
      { label: "Ubah", onSelect: () => openEditForm(item) },
      { label: "Nonaktifkan", onSelect: () => setPendingDeactivate(item), destructive: true },
    ];
  }

  const q = query.trim().toLowerCase();
  const visibleItems = items.filter(
    (i) =>
      (!categoryFilter || i.category_id === categoryFilter) &&
      (!q || [i.name, i.sku, i.barcode].some((v) => v?.toLowerCase().includes(q))),
  );

  if (!ready) return null;

  return (
    <Page width="wide">
      <PageHeader
        title="Produk"
        description="Katalog barang, jasa, dan stok awal"
        action={
          <Button onClick={openCreateForm}>
            <Plus className="h-4 w-4" /> Produk Baru
          </Button>
        }
      />

      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Ubah Produk" : "Produk Baru"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nama Produk</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sku">SKU</Label>
                  <Input id="sku" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input
                    id="barcode"
                    maxLength={60}
                    placeholder="Scan / ketik"
                    value={form.barcode}
                    onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category">Kategori</Label>
                <div className="flex gap-2">
                  <Select
                    id="category"
                    value={form.category_id}
                    onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                  >
                    <option value="">- Tanpa kategori -</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Kategori baru..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="h-9"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={handleAddCategory}>
                    Tambah
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unit">Satuan</Label>
                <Select id="unit" value={form.unit_id} onChange={(e) => setForm((f) => ({ ...f, unit_id: e.target.value }))}>
                  <option value="">- Tanpa satuan -</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.symbol})
                    </option>
                  ))}
                </Select>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nama satuan..."
                    value={newUnit.name}
                    onChange={(e) => setNewUnit((s) => ({ ...s, name: e.target.value }))}
                    className="h-9"
                  />
                  <Input
                    placeholder="Simbol"
                    value={newUnit.symbol}
                    onChange={(e) => setNewUnit((s) => ({ ...s, symbol: e.target.value }))}
                    className="h-9 w-20"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={handleAddUnit}>
                    Tambah
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item_type">Jenis Item</Label>
                <Select
                  id="item_type"
                  value={form.item_type}
                  onChange={(e) => setForm((f) => ({ ...f, item_type: e.target.value as ItemType }))}
                >
                  {Object.entries(ITEM_TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pricing_type">Tipe Harga</Label>
                <Select
                  id="pricing_type"
                  value={form.pricing_type}
                  onChange={(e) => setForm((f) => ({ ...f, pricing_type: e.target.value as PricingType }))}
                >
                  {Object.entries(PRICING_TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="base_price">Harga Jual</Label>
                <MoneyInput
                  id="base_price"
                  value={Number(form.base_price) || 0}
                  onValueChange={(v) => setForm((f) => ({ ...f, base_price: v ? String(v) : "" }))}
                  disabled={form.pricing_type === "open"}
                  placeholder={form.pricing_type === "open" ? "Diinput kasir saat jual" : undefined}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cost_price">Harga Modal (HPP)</Label>
                <MoneyInput
                  id="cost_price"
                  value={Number(form.cost_price) || 0}
                  onValueChange={(v) => setForm((f) => ({ ...f, cost_price: v ? String(v) : "" }))}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.track_stock}
                  onChange={(e) => setForm((f) => ({ ...f, track_stock: e.target.checked }))}
                />
                Lacak stok produk ini
              </label>

              {!form.id && form.track_stock && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="initial_stock">Stok Awal</Label>
                  <Input
                    id="initial_stock"
                    type="number"
                    min={0}
                    value={form.initial_stock}
                    onChange={(e) => setForm((f) => ({ ...f, initial_stock: e.target.value }))}
                  />
                </div>
              )}
            </div>

            {form.id && (
              <VariantsSection itemId={form.id} basePrice={Number(form.base_price) || 0} trackStock={form.track_stock} />
            )}

            <div className="flex gap-2">
              <Button disabled={saving} onClick={handleSubmit}>
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                {form.id ? "Tutup" : "Batal"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Cari produk"
              placeholder="Cari nama, SKU, atau barcode..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Filter kategori"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="sm:w-48"
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Memuat produk...</p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title="Belum ada produk"
              description="Tambahkan produk pertama Anda — barang, jasa, atau menu."
              action={
                <Button size="sm" onClick={openCreateForm}>
                  <Plus className="h-4 w-4" /> Produk Baru
                </Button>
              }
            />
          ) : visibleItems.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Tidak ada produk yang cocok.</p>
          ) : (
            <>
              {/* Desktop: tabel; klik nama = ubah, aksi lain di menu ⋯ */}
              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Nama</th>
                    <th className="px-4 py-2.5 font-medium">Kategori</th>
                    <th className="px-4 py-2.5 font-medium">Jenis</th>
                    <th className="px-4 py-2.5 text-right font-medium">Harga</th>
                    <th className="w-12 px-2 py-2.5">
                      <span className="sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => openEditForm(item)}
                      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-2.5">
                        <button type="button" className="text-left font-medium hover:underline" onClick={() => openEditForm(item)}>
                          {item.name}
                        </button>
                        {(item.sku || item.barcode) && (
                          <p className="text-xs text-muted-foreground">{[item.sku, item.barcode].filter(Boolean).join(" · ")}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{categoryName(item.category_id)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{ITEM_TYPE_LABEL[item.item_type]}</td>
                      <td className="px-4 py-2.5 text-right">
                        {item.pricing_type === "open" ? (
                          <span className="text-muted-foreground">Harga bebas</span>
                        ) : (
                          formatCurrency(item.base_price)
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <RowMenu label={`Aksi ${item.name}`} items={rowActions(item)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Ponsel: daftar ringkas */}
              <ul className="divide-y divide-border md:hidden">
                {visibleItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 py-1 pl-4 pr-2">
                    <button type="button" onClick={() => openEditForm(item)} className="min-w-0 flex-1 py-2 text-left">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {categoryName(item.category_id)} ·{" "}
                        {item.pricing_type === "open" ? "Harga bebas" : formatCurrency(item.base_price)}
                      </p>
                    </button>
                    <RowMenu label={`Aksi ${item.name}`} items={rowActions(item)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!pendingDeactivate}
        title="Nonaktifkan produk?"
        description={`"${pendingDeactivate?.name ?? ""}" tidak akan muncul lagi di layar kasir.`}
        confirmLabel="Nonaktifkan"
        destructive
        busy={deactivating}
        onConfirm={handleDeactivate}
        onClose={() => setPendingDeactivate(null)}
      />
    </Page>
  );
}
