import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/ui/page";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <Page width="narrow">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={Hourglass}
        title="Segera hadir"
        description="Fitur ini sedang disiapkan dan akan tersedia pada pembaruan berikutnya."
      />
    </Page>
  );
}
