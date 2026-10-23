"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { cn } from "@/lib/utils";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import type { NewCartLine } from "@/lib/cart-lines";
import type { CatalogItem, PosItemOptions } from "@/lib/types";

/** Item yang harus dipilih opsinya dulu (varian, modifier, atau harga manual). */
export function needsOptions(item: CatalogItem): boolean {
  return item.variant_count > 0 || item.modifier_group_count > 0 || item.pricing_type === "open";
}

type Group = PosItemOptions["modifier_groups"][number];

function minRequired(group: Group): number {
  return Math.max(group.min_select, group.is_required ? 1 : 0);
}

// Pemilih varian / modifier / harga bebas sebelum item masuk keranjang. Aturan
// sama dengan validasi server (resolveLineModifiers); harga di sini pratinjau.
export function ItemOptionsModal({
  item,
  onClose,
  onAdd,
}: {
  item: CatalogItem | null;
  onClose: () => void;
  onAdd: (line: NewCartLine) => void;
}) {
  const [options, setOptions] = useState<PosItemOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [openPrice, setOpenPrice] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!item) return;
    setOptions(null);
    setError(null);
    setVariantId(null);
    setSelected({});
    setOpenPrice(0);
    setQuantity(1);
    setNotes("");
    apiClient
      .get<PosItemOptions>(`/catalog/items/${item.id}/pos-options`)
      .then((o) => {
        setOptions(o);
        if (o.variants.length === 1) setVariantId(o.variants[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pilihan item."));
  }, [item]);

  if (!item) return null;

  const isOpen = options?.pricing_type === "open";
  const variant = options?.variants.find((v) => v.id === variantId) ?? null;
  const chosenModifiers =
    options?.modifier_groups.flatMap((g) => g.modifiers.filter((m) => (selected[g.id] ?? []).includes(m.id))) ?? [];
  const unitPrice =
    (isOpen ? openPrice : Number(options?.base_price ?? 0)) +
    Number(variant?.price_adjustment ?? 0) +
    chosenModifiers.reduce((sum, m) => sum + Number(m.price_adjustment), 0);

  const groupInvalid = (g: Group) => {
    const count = (selected[g.id] ?? []).length;
    return count < minRequired(g) || count > g.max_select;
  };
  const valid =
    !!options &&
    (options.variants.length === 0 || !!variantId) &&
    !options.modifier_groups.some(groupInvalid) &&
    (!isOpen || openPrice > 0);

  function toggleModifier(group: Group, modifierId: string) {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.selection_type === "single" || group.max_select === 1) {
        return { ...prev, [group.id]: current.includes(modifierId) && !group.is_required ? [] : [modifierId] };
      }
      if (current.includes(modifierId)) return { ...prev, [group.id]: current.filter((id) => id !== modifierId) };
      if (current.length >= group.max_select) return prev;
      return { ...prev, [group.id]: [...current, modifierId] };
    });
  }

  function handleAdd() {
    if (!options || !valid) return;
    onAdd({
      item_id: options.id,
      name: options.name,
      unit_price: unitPrice,
      quantity,
      variant_id: variant?.id ?? null,
      variant_name: variant?.name ?? null,
      modifier_ids: chosenModifiers.map((m) => m.id),
      modifier_names: chosenModifiers.map((m) => m.name),
      open_price: isOpen ? openPrice : null,
      notes,
    });
  }

  const adjustment = (value: string) => (Number(value) > 0 ? ` +${formatCurrency(value)}` : "");

  return (
    <Modal open onClose={onClose} title={item.name} className="sm:max-w-lg">
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : !options ? (
        <p className="text-sm text-muted-foreground">Memuat pilihan...</p>
      ) : (
        <div className="flex flex-col gap-5">
          {isOpen && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="open-price">Harga (Rp)</Label>
              <MoneyInput id="open-price" value={openPrice} onValueChange={setOpenPrice} placeholder="0" autoFocus />
            </div>
          )}

          {options.variants.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                Varian <span className="text-xs font-normal text-destructive">Wajib</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {options.variants.map((v) => (
                  <OptionChip
                    key={v.id}
                    selected={variantId === v.id}
                    label={`${v.name}${adjustment(v.price_adjustment)}`}
                    onClick={() => setVariantId(v.id)}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {options.modifier_groups.map((group) => {
            const min = minRequired(group);
            const rule =
              group.selection_type === "single" || group.max_select === 1
                ? "Pilih 1"
                : min > 0
                  ? `Pilih ${min}–${group.max_select}`
                  : `Maks. ${group.max_select}`;
            return (
              <fieldset key={group.id} className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">
                  {group.name}{" "}
                  <span className={cn("text-xs font-normal", min > 0 ? "text-destructive" : "text-muted-foreground")}>
                    {min > 0 ? "Wajib" : "Opsional"} · {rule}
                  </span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {group.modifiers.map((m) => (
                    <OptionChip
                      key={m.id}
                      selected={(selected[group.id] ?? []).includes(m.id)}
                      label={`${m.name}${adjustment(m.price_adjustment)}`}
                      onClick={() => toggleModifier(group, m.id)}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-notes">Catatan item (opsional)</Label>
            <input
              id="item-notes"
              value={notes}
              maxLength={100}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Mis. tanpa bawang"
              className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-lg border border-border">
              <button
                type="button"
                aria-label="Kurangi jumlah"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-accent"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-sm font-medium tabular-nums" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Tambah jumlah"
                onClick={() => setQuantity((q) => q + 1)}
                className="flex h-10 w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-accent"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Button disabled={!valid} onClick={handleAdd} className="flex-1">
              Tambah · {formatCurrency(unitPrice * quantity)}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function OptionChip({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        selected ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}
