"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

// Pengganti window.confirm(): bergaya sama dengan aplikasi, fokus awal di
// "Batal" supaya Enter yang tak sengaja tidak menjalankan aksi berbahaya.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" autoFocus onClick={onClose}>
          Batal
        </Button>
        <Button variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>
          {busy ? "Memproses..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
