"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useCartStore } from "@/lib/stores/cart-store";

export function VoucherModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const voucherCode = useCartStore((s) => s.voucherCode);
  const setVoucherCode = useCartStore((s) => s.setVoucherCode);
  const [code, setCode] = useState(voucherCode ?? "");

  useEffect(() => {
    if (open) setCode(voucherCode ?? "");
  }, [open, voucherCode]);

  function handleApply() {
    setVoucherCode(code.trim() ? code.trim().toUpperCase() : null);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Kode Voucher">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="voucher-code">Kode voucher</Label>
          <Input
            id="voucher-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Mis. HEMAT10"
            onKeyDown={(e) => e.key === "Enter" && handleApply()}
          />
          <p className="text-xs text-muted-foreground">
            Kelayakan &amp; nilai diskon voucher divalidasi otomatis oleh sistem saat transaksi disimpan.
          </p>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={handleApply}>
            Terapkan
          </Button>
          {voucherCode && (
            <Button
              variant="outline"
              onClick={() => {
                setVoucherCode(null);
                onClose();
              }}
            >
              Hapus
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
