"use client";

import { use, useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient, ApiError } from "@/lib/api-client";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import type { PublicReceipt } from "@/lib/types";

// Struk publik dari tautan WhatsApp — di luar grup (app): tanpa login & sidebar.
export default function PublicReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [receipt, setReceipt] = useState<PublicReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getPublic<PublicReceipt>(`/public/receipts/${token}`)
      .then(setReceipt)
      .catch((err) =>
        setError(err instanceof ApiError && err.status === 404 ? "Struk tidak ditemukan." : "Gagal memuat struk."),
      );
  }, [token]);

  if (error) {
    return <main className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">{error}</main>;
  }
  if (!receipt) {
    return <main className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">Memuat struk...</main>;
  }

  return (
    <main className="flex min-h-screen justify-center bg-muted/40 px-4 py-8 print:bg-background print:p-0">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <ReceiptPaper receipt={receipt} />

        <Button variant="outline" className="no-print" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Cetak / Simpan PDF
        </Button>
      </div>
    </main>
  );
}
