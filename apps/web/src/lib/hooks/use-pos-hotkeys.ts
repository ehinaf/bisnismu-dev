"use client";

import { useEffect } from "react";

interface PosHotkeyHandlers {
  onVoucher?: () => void;
  onHoldOrder?: () => void;
  onSubmit?: () => void;
  enabled?: boolean;
}

type HandlerKey = "onVoucher" | "onHoldOrder" | "onSubmit";

const KEY_MAP: Record<string, HandlerKey> = {
  F5: "onVoucher",
  F8: "onHoldOrder",
  F9: "onSubmit",
};

// F4-F10 selalu dicegah default-nya (F5 reload, F7 caret browsing, dsb.) agar
// tombol fungsi browser tidak terpicu tak sengaja di layar kasir — termasuk
// tombol yang belum punya aksi.
const RESERVED_KEYS = new Set(["F4", "F5", "F6", "F7", "F8", "F9", "F10"]);

export function usePosHotkeys(handlers: PosHotkeyHandlers) {
  useEffect(() => {
    if (handlers.enabled === false) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (!RESERVED_KEYS.has(e.key)) return;
      e.preventDefault();
      const handlerKey = KEY_MAP[e.key];
      if (handlerKey) handlers[handlerKey]?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlers.enabled, handlers.onVoucher, handlers.onHoldOrder, handlers.onSubmit]);
}
