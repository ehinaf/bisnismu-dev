"use client";

import { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { CloseShiftDialog, OpenShiftDialog } from "@/components/shell/shift-dialogs";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { useCashdrawer, useCashdrawerStore } from "@/lib/hooks/use-cashdrawer";
import { useOutletStore } from "@/lib/stores/outlet-store";
import type { CashDrawerSession, CashFlowType } from "@/lib/types";

export default function CashdrawerPage() {
  const { session } = useCashdrawer();
  const [dialog, setDialog] = useState<"open" | "close" | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader icon={Wallet} title="Kas & Laci" description="Kelola sesi laci kas dan catat kas masuk/keluar" />

      <CurrentSessionCard session={session} onOpen={() => setDialog("open")} onClose={() => setDialog("close")} />

      {session?.status === "open" && <MovementForm />}

      <HistorySection />

      <OpenShiftDialog open={dialog === "open"} onClose={() => setDialog(null)} />
      <CloseShiftDialog open={dialog === "close"} onClose={() => setDialog(null)} />
    </div>
  );
}

function CurrentSessionCard({
  session,
  onOpen,
  onClose,
}: {
  session: CashDrawerSession | null;
  onOpen: () => void;
  onClose: () => void;
}) {
  const isOpen = session?.status === "open";

  if (!isOpen) {
    return (
      <EmptyState
        icon={Wallet}
        title="Tidak ada laci yang terbuka"
        description="Buka shift untuk mulai mencatat penjualan tunai dan pergerakan kas."
        action={<Button onClick={onOpen}>Buka Shift</Button>}
      />
    );
  }

  const openedAt = new Date(session.opened_at).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const movements = session.movements ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          Sesi Laci Saat Ini
          <Badge variant="success">Terbuka</Badge>
        </CardTitle>
        <Button variant="destructive" size="sm" onClick={onClose}>
          Tutup Shift
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Saldo awal</p>
            <p className="font-semibold tabular-nums">{formatCurrency(session.opening_balance)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Dibuka</p>
            <p className="font-semibold">{openedAt}</p>
          </div>
        </div>

        {movements.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Kas masuk / keluar</p>
            <ul className="flex flex-col gap-1.5">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {m.flow_type === "cash_in" ? (
                      <ArrowDownCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4 shrink-0 text-red-500" />
                    )}
                    <span className="truncate">{m.reason}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {m.flow_type === "cash_in" ? "+" : "−"}
                    {formatCurrency(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MovementForm() {
  const { addMovement } = useCashdrawer();
  const [flowType, setFlowType] = useState<CashFlowType>("cash_in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value <= 0 || !reason.trim()) {
      setError("Isi nominal (lebih dari 0) dan alasan.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await addMovement(flowType, value, reason.trim());
      setAmount("");
      setReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mencatat pergerakan kas.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catat Kas Masuk / Keluar</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flow-type">Jenis</Label>
            <Select id="flow-type" value={flowType} onChange={(e) => setFlowType(e.target.value as CashFlowType)}>
              <option value="cash_in">Kas Masuk</option>
              <option value="cash_out">Kas Keluar</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-amount">Nominal (Rp)</Label>
            <Input
              id="movement-amount"
              type="number"
              min={0}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-reason">Alasan</Label>
            <Input
              id="movement-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mis. setor ke brankas"
              maxLength={150}
            />
          </div>
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button className="self-start" disabled={submitting} onClick={handleSubmit}>
          {submitting ? "Menyimpan..." : "Catat"}
        </Button>
      </CardContent>
    </Card>
  );
}

function HistorySection() {
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const currentSession = useCashdrawerStore((s) => s.session);
  const [history, setHistory] = useState<CashDrawerSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOutletId) return;
    setLoading(true);
    apiClient
      .get<CashDrawerSession[]>(`/cashdrawer/history?outlet_id=${activeOutletId}`)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [activeOutletId, currentSession?.id, currentSession?.status]);

  if (loading || history.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Riwayat Sesi</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Dibuka</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 text-right font-medium">Saldo awal</th>
              <th className="pb-2 text-right font-medium">Saldo akhir</th>
              <th className="pb-2 text-right font-medium">Ekspektasi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {history.map((s) => (
              <tr key={s.id}>
                <td className="py-2">
                  {new Date(s.opened_at).toLocaleString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="py-2">
                  <Badge variant={s.status === "open" ? "success" : "muted"}>
                    {s.status === "open" ? "Terbuka" : "Tertutup"}
                  </Badge>
                </td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(s.opening_balance)}</td>
                <td className="py-2 text-right tabular-nums">
                  {s.closing_balance !== null ? formatCurrency(s.closing_balance) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {s.expected_balance !== null ? formatCurrency(s.expected_balance) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
