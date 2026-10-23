import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/ui/page";

export default function HelpPage() {
  return (
    <Page width="narrow">
      <PageHeader title="Bantuan" description="Tips singkat penggunaan kasir" />
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
    </Page>
  );
}
