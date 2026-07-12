"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CartItemRow } from "@/components/cart-item-row";
import { formatCurrency } from "@/lib/format";
import { cartSubtotal, useCartStore } from "@/lib/stores/cart-store";

export function CartPanel() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const subtotal = cartSubtotal(items);

  return (
    <aside className="flex w-full flex-col border-t border-border bg-card p-4 lg:w-80 lg:border-l lg:border-t-0">
      <h2 className="mb-2 text-sm font-semibold">Keranjang</h2>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keranjang masih kosong. Klik produk untuk menambahkan.</p>
      ) : (
        <div className="flex-1 divide-y divide-border overflow-y-auto">
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
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
        <span>Subtotal</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>

      <Button className="mt-3 w-full" size="lg" disabled={items.length === 0} onClick={() => router.push("/checkout")}>
        Checkout
      </Button>
    </aside>
  );
}
