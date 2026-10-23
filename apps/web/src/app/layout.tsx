import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

// Di-self-host saat build oleh next/font — tidak ada permintaan ke Google saat dipakai.
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "BisnisMu",
  description: "POS Universal untuk UMKM Indonesia",
};

// Set class `dark` sebelum React hydrate supaya tidak ada flash tema salah
// (baca preferensi tersimpan di localStorage, fallback ke prefers-color-scheme).
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("bisnismu-theme");
    var isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", isDark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
