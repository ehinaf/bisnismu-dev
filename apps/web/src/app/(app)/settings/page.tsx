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

// Urutan sama dengan kartu di bawah; id = anchor tiap kartu.
const SECTIONS = [
  { id: "usaha", label: "Usaha & Struk" },
  { id: "fitur", label: "Fitur" },
  { id: "pajak", label: "Pajak" },
  { id: "outlet", label: "Outlet" },
  { id: "pengguna", label: "Pengguna & Izin" },
  { id: "pembayaran", label: "Metode Pembayaran" },
];

export default function SettingsPage() {
  const [me, setMe] = useState<{ id: string; role: UserRole } | null | undefined>(undefined);

  useEffect(() => {
    const user = getUser();
    setMe(user && (user.role === "owner" || user.role === "admin") ? { id: user.id, role: user.role } : null);
  }, []);

  return (
    <Page width="wide">
      <PageHeader title="Pengaturan" description="Usaha & struk, fitur, pajak, outlet, pengguna, dan metode pembayaran" />

      {me === null ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Hanya pemilik atau admin yang dapat membuka pengaturan.
        </p>
      ) : me ? (
        <div className="grid gap-6 lg:grid-cols-[11rem_minmax(0,48rem)]">
          {/* Navigasi bagian (pola Stripe) — hanya di layar besar; di ponsel kartu ditumpuk. */}
          <nav aria-label="Bagian pengaturan" className="hidden lg:block">
            <ul className="sticky top-20 flex flex-col gap-0.5 text-sm">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex min-w-0 flex-col gap-6">
            <BusinessCard />
            <FeaturesCard />
            <TaxesCard />
            <OutletsCard />
            <UsersCard currentUserId={me.id} currentRole={me.role} />
            <PaymentChannelsCard />
          </div>
        </div>
      ) : null}
    </Page>
  );
}
