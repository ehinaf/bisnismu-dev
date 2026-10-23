"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/ui/page";
import { BusinessCard } from "@/components/settings/business-card";
import { FeaturesCard } from "@/components/settings/features-card";
import { OutletsCard } from "@/components/settings/outlets-card";
import { PaymentChannelsCard } from "@/components/settings/payment-channels-card";
import { TaxesCard } from "@/components/settings/taxes-card";
import { UsersCard } from "@/components/settings/users-card";
import { getUser } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

export default function SettingsPage() {
  const [me, setMe] = useState<{ id: string; role: UserRole } | null | undefined>(undefined);

  useEffect(() => {
    const user = getUser();
    setMe(user && (user.role === "owner" || user.role === "admin") ? { id: user.id, role: user.role } : null);
  }, []);

  return (
    <Page width="narrow">
      <PageHeader title="Pengaturan" description="Usaha & struk, fitur, pajak, outlet, pengguna, dan metode pembayaran" />

      {me === null ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Hanya pemilik atau admin yang dapat membuka pengaturan.
        </p>
      ) : me ? (
        <>
          <BusinessCard />
          <FeaturesCard />
          <TaxesCard />
          <OutletsCard />
          <UsersCard currentUserId={me.id} currentRole={me.role} />
          <PaymentChannelsCard />
        </>
      ) : null}
    </Page>
  );
}
