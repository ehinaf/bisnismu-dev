"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { OutletsCard } from "@/components/settings/outlets-card";
import { PaymentChannelsCard } from "@/components/settings/payment-channels-card";
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
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader icon={Settings} title="Pengaturan" description="Outlet, pengguna, dan metode pembayaran" />

      {me === null ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Hanya pemilik atau admin yang dapat membuka pengaturan.
        </p>
      ) : me ? (
        <>
          <OutletsCard />
          <UsersCard currentUserId={me.id} currentRole={me.role} />
          <PaymentChannelsCard />
          <p className="text-sm text-muted-foreground">Pengaturan pajak, pembulatan, dan struk — segera hadir.</p>
        </>
      ) : null}
    </div>
  );
}
