"use client";

import { Grid3x3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

export function CategorySidebar({
  categories,
  activeCategoryId,
  onSelect,
}: {
  categories: Category[];
  activeCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}) {
  // Baru tampil di xl: pada 1024–1279px kolom ini memakan ruang grid produk
  // yang sudah dihimpit sidebar menu dan kolom keranjang (pakai chip di sana).
  return (
    <aside className="hidden w-[168px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-3 xl:flex">
      <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Kategori</p>
      <CategoryButton icon={Grid3x3} label="Semua Produk" active={activeCategoryId === null} onClick={() => onSelect(null)} />
      {categories.map((c) => (
        <CategoryButton key={c.id} label={c.name} active={activeCategoryId === c.id} onClick={() => onSelect(c.id)} />
      ))}
    </aside>
  );
}

// Chip horizontal untuk layar sempit — kategori sama, tampilan berbeda.
export function CategoryChips({
  categories,
  activeCategoryId,
  onSelect,
}: {
  categories: Category[];
  activeCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2 xl:hidden">
      <ChipButton label="Semua" active={activeCategoryId === null} onClick={() => onSelect(null)} />
      {categories.map((c) => (
        <ChipButton key={c.id} label={c.name} active={activeCategoryId === c.id} onClick={() => onSelect(c.id)} />
      ))}
    </div>
  );
}

function CategoryButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 truncate rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function ChipButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}
