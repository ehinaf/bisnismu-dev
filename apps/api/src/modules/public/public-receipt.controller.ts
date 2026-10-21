import { Controller, Get, Param } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PublicReceiptService } from "./public-receipt.service";

// Tanpa JwtAuthGuard: dibuka pembeli dari tautan WhatsApp. Throttle per IP
// membatasi upaya menebak token (122 bit acak — praktis tidak tertebak).
@Controller("public/receipts")
export class PublicReceiptController {
  constructor(private readonly publicReceiptService: PublicReceiptService) {}

  @Get(":token")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  getReceipt(@Param("token") token: string) {
    return this.publicReceiptService.getReceipt(token);
  }
}
