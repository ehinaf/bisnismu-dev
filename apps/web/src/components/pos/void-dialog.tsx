"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { apiClient, ApiError } from "@/lib/api-client";

// Void penjualan / batal open bill — alasan wajib karena tercatat di log audit.
export function VoidDialog({
  open,
  transactionId,
  title,
  description,
  confirmLabel,
  onClose,
  onVoided,
}: {
  open: boolean;
  transactionId: string;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onVoided: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = reason.trim().length >= 3;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/transactions/${transactionId}/void`, { reason: reason.trim() });
      setReason("");
      onVoided();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membatalkan transaksi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="void-reason">Alasan pembatalan</Label>
          <textarea
            id="void-reason"
            rows={3}
            autoFocus
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Mis. salah input pesanan"
            aria-describedby="void-reason-hint"
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p id="void-reason-hint" className="text-xs text-muted-foreground">
            Minimal 3 karakter. Alasan dan nama Anda tercatat di log audit.
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button variant="destructive" disabled={!valid || submitting} onClick={handleSubmit}>
            {submitting ? "Memproses..." : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
