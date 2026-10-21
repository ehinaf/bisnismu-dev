import { Module } from "@nestjs/common";
import { PublicReceiptController } from "./public-receipt.controller";
import { PublicReceiptService } from "./public-receipt.service";

// Endpoint tanpa login (struk publik). Sengaja dipisah dari modul lain supaya
// jelas mana saja yang terbuka tanpa autentikasi.
@Module({
  controllers: [PublicReceiptController],
  providers: [PublicReceiptService],
})
export class PublicModule {}
