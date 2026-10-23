"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, ShoppingCart, Trash2 } from "lucide-react";
import { CartItemRow } from "@/components/cart-item-row";
import { useCartStore } from "@/lib/stores/cart-store";

export function PosCart() {
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);
  const orderNotes = useCartStore((s) => s.orderNotes);
  const setOrderNotes = useCartStore((s) => s.setOrderNotes);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const count = items.reduce((n, i) => n + i.quantity, 0);

  // Keranjang juga bisa kosong dari luar (transaksi tersimpan, hold order) —
  // jangan biarkan konfirmasi lama muncul lagi saat keranjang diisi berikutnya.
  useEffect(() => {
    if (items.length === 0) setConfirmingClear(false);
  }, [items.length]);

  return (
    <div className="flex flex-1 flex-col border-b border-border">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Keranjang ({count})</h2>
        </div>
        {items.length > 0 &&
          (confirmingClear ? (
            <div role="group" aria-label="Kosongkan keranjang?" className="-my-1 flex items-center gap-1">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmingClear(false)}
                className="rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-accent"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  clear();
                  setConfirmingClear(false);
                }}
                className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90"
              >
                Ya, kosongkan
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              className="-my-1 -mr-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Kosongkan
            </button>
          ))}
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ShoppingBag className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <p className="text-sm text-muted-foreground">Ketuk produk atau scan barcode untuk mulai.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-4 lg:max-h-[38vh]">
          {items.map((item) => (
            <CartItemRow
              key={item.line_key}
              item={item}
              onIncrease={() => updateQuantity(item.line_key, item.quantity + 1)}
              onDecrease={() => updateQuantity(item.line_key, item.quantity - 1)}
              onRemove={() => removeItem(item.line_key)}
            />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="px-4 py-3">
          <textarea
            rows={2}
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="Catatan order (opsional) — mis. tanpa es"
            aria-label="Catatan order"
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}
    </div>
  );
}
