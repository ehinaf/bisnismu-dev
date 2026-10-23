import { cn } from "@/lib/utils";

// Kartu angka ringkas (pola Stripe): label kecil, angka besar, tanpa ikon hiasan.
// Warna hanya untuk makna (laba positif/negatif).
export function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight",
          accent === "positive" && "text-success",
          accent === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
