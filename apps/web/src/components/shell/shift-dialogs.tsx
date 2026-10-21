"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { useCashdrawer } from "@/lib/hooks/use-cashdrawer";
import { useOutletStore } from "@/lib/stores/outlet-store";

function parseRupiah(value: string): number {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function OpenShiftDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const { openDrawer } = useCashdrawer();
  const [balance, setBalance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!activeOutletId) return;
    setError(null);
    setSubmitting(true);
    try {
      await openDrawer(activeOutletId, parseRupiah(balance));
      setBalance("");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuka shift.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Buka Shift">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="opening-balance">Saldo awal laci (Rp)</Label>
          <MoneyInput
            id="opening-balance"
            value={parseRupiah(balance)}
            onValueChange={(v) => setBalance(String(v))}
            placeholder="0"
            autoFocus
          />
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button disabled={submitting || !activeOutletId} onClick={handleSubmit}>
          {submitting ? "Memproses..." : "Buka Shift"}
        </Button>
      </div>
    </Modal>
  );
}

export function CloseShiftDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, closeDrawer } = useCashdrawer();
  const [balance, setBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await closeDrawer(parseRupiah(balance), notes.trim() || undefined);
      setBalance("");
      setNotes("");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menutup shift.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tutup Shift">
      <div className="flex flex-col gap-4">
        {session && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Saldo awal: <span className="font-medium text-foreground">{formatCurrency(session.opening_balance)}</span>
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="closing-balance">Saldo akhir dihitung (Rp)</Label>
          <MoneyInput
            id="closing-balance"
            value={parseRupiah(balance)}
            onValueChange={(v) => setBalance(String(v))}
            placeholder="0"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="closing-notes">Catatan (opsional)</Label>
          <Input
            id="closing-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Mis. selisih karena ..."
          />
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button variant="destructive" disabled={submitting || !session} onClick={handleSubmit}>
          {submitting ? "Memproses..." : "Tutup Shift"}
        </Button>
      </div>
    </Modal>
  );
}
