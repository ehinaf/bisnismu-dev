"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { apiClient, ApiError } from "@/lib/api-client";
import { useCartStore } from "@/lib/stores/cart-store";
import type { Customer } from "@/lib/types";

export function CustomerPickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const customer = useCartStore((s) => s.customer);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiClient
      .get<Customer[]>("/customers")
      .then(setCustomers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pelanggan."))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => (c.name ?? "").toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [customers, query]);

  return (
    <Modal open={open} onClose={onClose} title="Pilih Pelanggan">
      <div className="flex flex-col gap-3">
        {customer && (
          <button
            type="button"
            onClick={() => {
              setCustomer(null);
              onClose();
            }}
            className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            <span>Batalkan pilihan: {customer.name}</span>
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Cari nama atau nomor HP..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada pelanggan cocok.</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCustomer({ id: c.id, name: c.name ?? "Tanpa nama" });
                  onClose();
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.name ?? "Tanpa nama"}</span>
                  {c.phone && <span className="block text-xs text-muted-foreground">{c.phone}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
