import { Banknote, CreditCard, Landmark, QrCode, Wallet, type LucideIcon } from "lucide-react";

export const CHANNEL_ICONS: Record<string, LucideIcon> = {
  cash: Banknote,
  qris: QrCode,
  e_wallet: Wallet,
  bank_transfer: Landmark,
  debit: CreditCard,
  credit: CreditCard,
};

// Sama dengan CHANNEL_TYPES di API (create-payment-channel.dto.ts).
export const CHANNEL_TYPE_OPTIONS = [
  { value: "cash", label: "Tunai" },
  { value: "qris", label: "QRIS" },
  { value: "e_wallet", label: "Dompet digital" },
  { value: "bank_transfer", label: "Transfer bank" },
  { value: "debit", label: "Kartu debit" },
  { value: "credit", label: "Kartu kredit" },
] as const;
