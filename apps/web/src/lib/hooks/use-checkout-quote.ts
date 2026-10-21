"use client";

import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import type { CheckoutQuote } from "@/lib/types";

/**
 * Total final dari server — POST /transactions/quote (keranjang) atau
 * POST /transactions/:id/quote (open bill) — dengan aturan yang sama persis
 * dengan saat transaksi disimpan (diskon otomatis, voucher, pajak, pembulatan).
 * Diminta ulang (debounce) setiap path/body berubah; `loading` = true selama
 * angka belum sesuai isi terbaru, `quote` null selama itu.
 */
export function useCheckoutQuote(path: string | null, body: unknown, debounceMs = 250) {
  const [result, setResult] = useState<{ key: string; quote: CheckoutQuote | null; error: string | null } | null>(
    null,
  );
  const key = path ? JSON.stringify([path, body ?? {}]) : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [requestPath, requestBody] = JSON.parse(key) as [string, unknown];
      try {
        const quote = await apiClient.post<CheckoutQuote>(requestPath, requestBody);
        if (!cancelled) setResult({ key, quote, error: null });
      } catch (err) {
        if (!cancelled) {
          setResult({ key, quote: null, error: err instanceof ApiError ? err.message : "Gagal menghitung total." });
        }
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, debounceMs]);

  const fresh = key !== null && result?.key === key;
  return {
    quote: fresh ? result.quote : null,
    error: fresh ? result.error : null,
    loading: key !== null && !fresh,
  };
}
