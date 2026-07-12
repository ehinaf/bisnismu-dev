"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api-client";
import { getUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import type { Category, ItemDetail, ItemType, Outlet, PricingType, Unit } from "@/lib/types";

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

  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [items, setItems] = useState<ItemDetail[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newUnit, setNewUnit] = useState({ name: "", symbol: "" });

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
      const [outlets, itemList, categoryList, unitList] = await Promise.all([
        apiClient.get<Outlet[]>("/tenant/outlets"),
        apiClient.get<ItemDetail[]>("/catalog/items"),
        apiClient.get<Category[]>("/catalog/categories"),
        apiClient.get<Unit[]>("/catalog/units"),
      ]);
      setOutlet(outlets[0] ?? null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        base_price: Number(form.base_price),
        cost_price: form.cost_price ? Number(form.cost_price) : undefined,
        item_type: form.item_type,
        pricing_type: form.pricing_type,
        track_stock: form.track_stock,
      };

      let item: ItemDetail;
      if (form.id) {
        item = await apiClient.patch<ItemDetail>(`/catalog/items/${form.id}`, payload);
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
      }

      setFormOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan produk.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(item: ItemDetail) {
    if (!confirm(`Nonaktifkan "${item.name}"? Produk ini tidak akan muncul lagi di layar kasir.`)) return;
    setError(null);
    try {
      await apiClient.delete(`/catalog/items/${item.id}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menonaktifkan produk.");
    }
  }

  function categoryName(id: string | null) {
    return categories.find((c) => c.id === id)?.name ?? "-";
  }

  if (!ready) return null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Kelola Produk</h1>
        <Button onClick={openCreateForm}>+ Produk Baru</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
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
                <Input
                  id="base_price"
                  type="number"
                  min={0}
                  value={form.base_price}
                  onChange={(e) => setForm((f) => ({ ...f, base_price: e.target.value }))}
                  disabled={form.pricing_type === "open"}
                  placeholder={form.pricing_type === "open" ? "Diinput kasir saat jual" : undefined}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cost_price">Harga Modal (HPP)</Label>
                <Input
                  id="cost_price"
                  type="number"
                  min={0}
                  value={form.cost_price}
                  onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
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
            <p className="p-4 text-sm text-muted-foreground">Memuat produk...</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Belum ada produk. Klik &quot;+ Produk Baru&quot; untuk mulai.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Nama</th>
                    <th className="p-3 font-medium">Kategori</th>
                    <th className="p-3 font-medium">Jenis</th>
                    <th className="p-3 text-right font-medium">Harga</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">{categoryName(item.category_id)}</td>
                      <td className="p-3">{ITEM_TYPE_LABEL[item.item_type]}</td>
                      <td className="p-3 text-right">
                        {item.pricing_type === "open" ? "Bebas" : formatCurrency(item.base_price)}
                      </td>
                      <td className="p-3">
                        <span
                          className={
                            item.is_active
                              ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-950 dark:text-green-400"
                              : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          }
                        >
                          {item.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditForm(item)}>
                            Ubah
                          </Button>
                          {item.is_active && (
                            <Button size="sm" variant="ghost" onClick={() => handleDeactivate(item)}>
                              Nonaktifkan
                            </Button>
                          )}
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
