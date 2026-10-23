import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { TenantModule } from "./modules/tenant/tenant.module";
import { SalesModule } from "./modules/sales/sales.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CashdrawerModule } from "./modules/cashdrawer/cashdrawer.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { ReportModule } from "./modules/report/report.module";
import { ExpenseModule } from "./modules/expense/expense.module";
import { CustomerModule } from "./modules/customer/customer.module";
import { PromotionModule } from "./modules/promotion/promotion.module";
import { PublicModule } from "./modules/public/public.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Batas umum per IP sengaja longgar: satu toko (beberapa tablet di satu Wi-Fi/NAT)
    // berbagi satu IP, dan layar kasir memanggil API terus-menerus (katalog, quote,
    // polling laci). Endpoint login/PIN punya batas ketat sendiri (@Throttle di AuthController).
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 600 }],
      // Tampil apa adanya di layar (mis. login PIN) — bukan "ThrottlerException: Too Many Requests".
      errorMessage: "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.",
    }),
    PrismaModule,
    AuthModule,
    TenantModule,
    SalesModule,
    CatalogModule,
    CashdrawerModule,
    InventoryModule,
    ReportModule,
    ExpenseModule,
    CustomerModule,
    PromotionModule,
    PublicModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
