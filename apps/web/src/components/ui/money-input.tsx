"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

const rupiah = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number;
  onValueChange: (value: number) => void;
}

// Input nominal rupiah bulat bertitik ribuan ("150.000") — pengganti
// type="number" yang tanpa pemisah dan nilainya ikut berubah bila roda mouse
// di-scroll di atasnya. Nilai 0 ditampilkan kosong supaya placeholder terlihat.
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onValueChange, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    // Titik ribuan disisipkan ulang tiap ketikan; simpan jumlah digit di kiri
    // kursor supaya kursor bisa dikembalikan ke posisi digit yang sama.
    const digitsBeforeCaret = React.useRef<number | null>(null);

    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    React.useLayoutEffect(() => {
      const el = innerRef.current;
      const target = digitsBeforeCaret.current;
      digitsBeforeCaret.current = null;
      if (!el || target === null || document.activeElement !== el) return;
      let pos = 0;
      for (let seen = 0; pos < el.value.length && seen < target; pos++) {
        if (/\d/.test(el.value[pos])) seen++;
      }
      el.setSelectionRange(pos, pos);
    });

    return (
      <Input
        ref={innerRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value > 0 ? rupiah.format(value) : ""}
        onChange={(e) => {
          const raw = e.target.value;
          digitsBeforeCaret.current = raw.slice(0, e.target.selectionStart ?? raw.length).replace(/\D/g, "").length;
          const digits = raw.replace(/\D/g, "").slice(0, 12);
          onValueChange(digits ? Number(digits) : 0);
        }}
        {...props}
      />
    );
  },
);
MoneyInput.displayName = "MoneyInput";
