import { cn } from "@/lib/utils";

const WIDTHS = {
  // Tabel & daftar (Produk, Pelanggan, Stok, Riwayat, Laporan, ...).
  wide: "max-w-6xl",
  // Form & halaman baca (Pengaturan, Kas & Laci, struk).
  narrow: "max-w-3xl",
} as const;

// Wadah standar halaman back-office: lebar, padding, dan jarak antarbagian seragam.
export function Page({
  width = "wide",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6", WIDTHS[width], className)}>{children}</div>;
}
