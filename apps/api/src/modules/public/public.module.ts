import { Module } from "@nestjs/common";
import { PublicReceiptController } from "./public-receipt.controller";
import { PublicReceiptService } from "./public-receipt.service";

// Endpoint tanpa login (struk publik). Sengaja dipisah dari modul lain supaya
// jelas mana saja yang terbuka tanpa autentikasi. Service-nya diekspor agar
// struk cetak di aplikasi (SalesModule, ber-login) memakai tampilan yang sama.
@Module({
  controllers: [PublicReceiptController],
  providers: [PublicReceiptService],
  exports: [PublicReceiptService],
})
export class PublicModule {}
