"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient, ApiError } from "@/lib/api-client";
import { getUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import type { Customer, CustomerReceivable, ReceivableStatus } from "@/lib/types";

const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

const STATUS_BADGE: Record<ReceivableStatus, string> = {
  outstanding: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  partially_paid: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  paid: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  written_off: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<ReceivableStatus, string> = {
  outstanding: "Belum Dibayar",
  partially_paid: "Sebagian",
  paid: "Lunas",
  written_off: "Dihapus",
};

function remaining(r: CustomerReceivable): number {
  return Number(r.amount) - Number(r.amount_paid);
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [receivables, setReceivables] = useState<CustomerReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
      router.replace("/dashboard");
      return;
    }
    setReady(true);
  }, [router]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [cust, recv] = await Promise.all([
        apiClient.get<Customer>(`/customers/${id}`),
        apiClient.get<CustomerReceivable[]>(`/customers/${id}/receivables`),
      ]);
      setCustomer(cust);
      setReceivables(recv);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat data pelanggan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id]);

  function startPayment(receivable: CustomerReceivable) {
    setPayingId(receivable.id);
    setPayAmount(String(remaining(receivable)));
    setPayMethod("cash");
    setError(null);
  }

  async function submitPayment(receivableId: string) {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/customers/${id}/receivables/${receivableId}/payments`, {
        amount,
        payment_method: payMethod,
      });
      setPayingId(null);
      setPayAmount("");
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mencatat cicilan.");
    } finally {
      setSubmitting(false);
    }
  }

  const totalOutstanding = receivables
    .filter((r) => r.status === "outstanding" || r.status === "partially_paid")
    .reduce((sum, r) => sum + remaining(r), 0);

  if (!ready) return null;
  if (loading) return <p className="p-4 text-sm text-muted-foreground">Memuat...</p>;
  if (!customer) return <p className="p-4 text-sm text-destructive">Pelanggan tidak ditemukan.</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/customers")}>
          ← Kembali ke Pelanggan
        </Button>
        <h1 className="text-lg font-semibold">{customer.name ?? "(tanpa nama)"}</h1>
        {customer.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Belanja" value={formatCurrency(customer.total_spent)} />
        <StatCard label="Poin Loyalti" value={String(customer.loyalty_points)} />
        <StatCard label="Limit Kasbon" value={formatCurrency(customer.credit_limit)} />
        <StatCard
          label="Sisa Piutang"
          value={formatCurrency(totalOutstanding)}
          accent={totalOutstanding > 0 ? "negative" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kasbon / Piutang</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {receivables.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pelanggan ini tidak punya catatan kasbon.</p>
          ) : (
            receivables.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("id-ID")}
                    </span>
                    <span className="text-sm">
                      {formatCurrency(r.amount_paid)} / {formatCurrency(r.amount)} terbayar
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    {(r.status === "outstanding" || r.status === "partially_paid") && payingId !== r.id && (
                      <Button size="sm" onClick={() => startPayment(r)}>
                        Bayar Cicilan
                      </Button>
                    )}
                  </div>
                </div>

                {(r.status === "outstanding" || r.status === "partially_paid") && (
                  <p className="mt-1 text-sm font-semibold text-destructive">Sisa: {formatCurrency(remaining(r))}</p>
                )}

                {payingId === r.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`pay-${r.id}`} className="text-xs">
                        Jumlah Cicilan
                      </Label>
                      <Input
                        id={`pay-${r.id}`}
                        type="number"
                        min={0}
                        max={remaining(r)}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="h-9 w-36"
                      />
                    </div>
                    <Button size="sm" disabled={submitting} onClick={() => submitPayment(r.id)}>
                      {submitting ? "Menyimpan..." : "Simpan Cicilan"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPayingId(null)}>
                      Batal
                    </Button>
                  </div>
                )}

                {r.payments.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1 border-t border-border pt-2">
                    <span className="text-xs text-muted-foreground">Riwayat cicilan:</span>
                    {r.payments.map((p) => (
                      <div key={p.id} className="flex justify-between text-xs">
                        <span>{new Date(p.paid_at).toLocaleDateString("id-ID")} · {p.payment_method}</span>
                        <span>{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "negative" }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={accent === "negative" ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>
          {value}
        </span>
      </CardContent>
    </Card>
  );
}
