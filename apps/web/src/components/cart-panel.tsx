"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, ShoppingCart, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartItemRow } from "@/components/cart-item-row";
import { formatCurrency } from "@/lib/format";
import { cartSubtotal, useCartStore, type CartItem } from "@/lib/stores/cart-store";

export function CartPanel() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);

  const subtotal = cartSubtotal(items);
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const [open, setOpen] = useState(false);

  function goCheckout() {
    setOpen(false);
    router.push("/checkout");
  }

  return (
    <>
      {/* Sidebar — desktop */}
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[360px] shrink-0 flex-col border-l border-border bg-card lg:flex">
        <CartHeader count={count} onClear={items.length ? clear : undefined} />
        <CartBody items={items} updateQuantity={updateQuantity} removeItem={removeItem} />
        <CartFooter subtotal={subtotal} disabled={items.length === 0} onCheckout={goCheckout} />
      </aside>

      {/* Bottom bar — mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden">
        <Button
          className="flex w-full items-center justify-between"
          size="lg"
          disabled={items.length === 0}
          onClick={() => setOpen(true)}
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            {count > 0 ? `${count} item` : "Keranjang kosong"}
          </span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </Button>
      </div>

      {/* Sheet — mobile */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl">
            <CartHeader count={count} onClear={items.length ? clear : undefined} onClose={() => setOpen(false)} />
            <CartBody items={items} updateQuantity={updateQuantity} removeItem={removeItem} />
            <CartFooter subtotal={subtotal} disabled={items.length === 0} onCheckout={goCheckout} />
          </div>
        </div>
      )}
    </>
  );
}

function CartHeader({ count, onClear, onClose }: { count: number; onClear?: () => void; onClose?: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-4">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-4 w-4" />
        <h2 className="text-sm font-semibold">Keranjang</h2>
        {count > 0 && (
          <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
            {count}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Kosongkan
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    </header>
  );
}

function CartBody({
  items,
  updateQuantity,
  removeItem,
}: {
  items: CartItem[];
  updateQuantity: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <ShoppingBag className="h-6 w-6 text-muted-foreground/60" />
        </div>
        <p className="text-sm text-muted-foreground">Keranjang masih kosong. Ketuk produk untuk menambahkan.</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-4">
      {items.map((item) => (
        <CartItemRow
          key={item.item_id}
          item={item}
          onIncrease={() => updateQuantity(item.item_id, item.quantity + 1)}
          onDecrease={() => updateQuantity(item.item_id, item.quantity - 1)}
          onRemove={() => removeItem(item.item_id)}
        />
      ))}
    </div>
  );
}

function CartFooter({
  subtotal,
  disabled,
  onCheckout,
}: {
  subtotal: number;
  disabled: boolean;
  onCheckout: () => void;
}) {
  return (
    <div className="space-y-3 border-t border-border p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-semibold tabular-nums">{formatCurrency(subtotal)}</span>
      </div>
      <Button className="w-full" size="lg" disabled={disabled} onClick={onCheckout}>
        Lanjut ke Pembayaran
      </Button>
    </div>
  );
}
