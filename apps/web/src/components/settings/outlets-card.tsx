"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { apiClient, ApiError } from "@/lib/api-client";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { toast } from "@/lib/stores/toast-store";
import type { Outlet } from "@/lib/types";

interface FormState {
  id: string | null;
  name: string;
  address: string;
  phone: string;
}

const EMPTY_FORM: FormState = { id: null, name: "", address: "", phone: "" };

// Daftar outlet dibaca dari store yang sama dengan pemilih outlet di sidebar,
// jadi setelah simpan cukup muat ulang store — sidebar ikut berubah.
export function OutletsCard() {
  const outlets = useOutletStore((s) => s.outlets);
  const loaded = useOutletStore((s) => s.loaded);
  const setOutlets = useOutletStore((s) => s.setOutlets);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setFormError(null);
    setForm(EMPTY_FORM);
  }

  function openEdit(o: Outlet) {
    setFormError(null);
    setForm({ id: o.id, name: o.name, address: o.address ?? "", phone: o.phone ?? "" });
  }

  async function handleSubmit() {
    if (!form) return;
    setFormError(null);
    if (!form.name.trim()) return setFormError("Nama outlet wajib diisi.");

    const body = { name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim() };
    setSaving(true);
    try {
      if (form.id) {
        await apiClient.patch(`/tenant/outlets/${form.id}`, body);
      } else {
        await apiClient.post("/tenant/outlets", body);
      }
      setOutlets(await apiClient.get<Outlet[]>("/tenant/outlets"));
      toast.success(form.id ? `${body.name} diperbarui.` : `${body.name} ditambahkan. Isi stok awalnya di menu Stok.`);
      setForm(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan outlet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="outlet" className="scroll-mt-20">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Outlet</CardTitle>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Tempat berjualan. Stok, laci kas, dan meja dicatat per outlet; alamat & telepon tampil di struk digital.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4" /> Tambah
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {!loaded ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Memuat outlet...</p>
        ) : outlets.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Belum ada outlet. Tambahkan satu untuk mulai berjualan.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {outlets.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {o.name}
                    {!o.is_active && <Badge variant="muted">Nonaktif</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[o.address, o.phone].filter(Boolean).join(" · ") || "Alamat & telepon belum diisi"}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openEdit(o)} aria-label={`Ubah ${o.name}`}>
                  <Pencil className="h-3.5 w-3.5" /> Ubah
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? "Ubah Outlet" : "Tambah Outlet"}>
        {form && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="outlet-name">Nama outlet</Label>
              <Input
                id="outlet-name"
                autoFocus
                maxLength={150}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="outlet-address">Alamat</Label>
              <Input
                id="outlet-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="outlet-phone">Telepon</Label>
              <Input
                id="outlet-phone"
                type="tel"
                maxLength={30}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
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
    </Card>
  );
}
