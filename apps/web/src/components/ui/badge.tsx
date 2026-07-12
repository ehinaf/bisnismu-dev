import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary",
        muted: "bg-muted text-muted-foreground",
        success: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
        warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
        danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
        info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
