import { HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function HelpPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader icon={HelpCircle} title="Bantuan" description="Tips singkat penggunaan kasir" />
      <Card>
        <CardHeader>
          <CardTitle>Pintasan keyboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>F5 — masukkan kode voucher.</p>
          <p>F6 — lihat pajak &amp; biaya aktif (tekan lagi untuk menutup).</p>
          <p>F8 — tahan order (open bill) untuk dilanjutkan nanti.</p>
          <p>F9 — simpan transaksi.</p>
          <p>Scan barcode atau ketik nama produk pada kolom pencarian untuk menambah ke keranjang.</p>
        </CardContent>
      </Card>
    </div>
  );
}
