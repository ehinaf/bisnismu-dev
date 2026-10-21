import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            disabled={item.disabled}
            title={item.disabled ? "Segera hadir" : undefined}
            onClick={() => !item.disabled && onChange(item.value)}
            className={cn(
              "relative px-3 py-2.5 text-sm font-medium transition-colors",
              item.disabled
                ? "cursor-not-allowed text-muted-foreground/40"
                : active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}
