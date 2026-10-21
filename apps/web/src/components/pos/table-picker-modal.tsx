"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, X } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { useCartStore } from "@/lib/stores/cart-store";
import type { DiningTable } from "@/lib/types";

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  available: "success",
  occupied: "warning",
  reserved: "info",
  inactive: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  available: "Tersedia",
  occupied: "Terisi",
  reserved: "Dipesan",
  inactive: "Nonaktif",
};

export function TablePickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const table = useCartStore((s) => s.table);
  const setTable = useCartStore((s) => s.setTable);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !activeOutletId) return;
    setLoading(true);
    apiClient
      .get<DiningTable[]>(`/tenant/outlets/${activeOutletId}/tables`)
      .then(setTables)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat meja."))
      .finally(() => setLoading(false));
  }, [open, activeOutletId]);

  return (
    <Modal open={open} onClose={onClose} title="Pilih Meja">
      <div className="flex flex-col gap-3">
        {table && (
          <button
            type="button"
            onClick={() => {
              setTable(null);
              onClose();
            }}
            className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            <span>Batalkan pilihan: {table.name}</span>
            <X className="h-4 w-4" />
          </button>
        )}

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
        ) : tables.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada meja terdaftar.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {tables.map((t) => {
              const disabled = t.status === "inactive";
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setTable({ id: t.id, name: t.name });
                    onClose();
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-center transition-colors",
                    disabled ? "cursor-not-allowed opacity-50" : "hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate text-xs font-medium">{t.name}</span>
                  <Badge variant={STATUS_VARIANT[t.status] ?? "muted"}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
