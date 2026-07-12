import { Hourglass, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function ComingSoon({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader icon={icon} title={title} description={description} />
      <EmptyState
        icon={Hourglass}
        title="Segera hadir"
        description="Fitur ini sedang disiapkan dan akan tersedia pada pembaruan berikutnya."
      />
    </div>
  );
}
