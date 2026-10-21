import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-semibold text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
