"use client";

import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

// Tab kategori horizontal di atas grid produk (ala Square) — di semua ukuran
// layar, supaya lebar layar sepenuhnya untuk produk.
export function CategoryChips({
  categories,
  activeCategoryId,
  onSelect,
}: {
  categories: Category[];
  activeCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-3" role="group" aria-label="Kategori">
      <ChipButton label="Semua" active={activeCategoryId === null} onClick={() => onSelect(null)} />
      {categories.map((c) => (
        <ChipButton key={c.id} label={c.name} active={activeCategoryId === c.id} onClick={() => onSelect(c.id)} />
      ))}
    </div>
  );
}

function ChipButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
