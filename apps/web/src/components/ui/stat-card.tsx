import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  accent?: "positive" | "negative";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground/60" />}
      </div>
      <p
        className={cn(
          "mt-1.5 text-xl font-semibold tracking-tight tabular-nums",
          accent === "positive" && "text-green-600 dark:text-green-400",
          accent === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
