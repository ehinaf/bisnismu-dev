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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
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
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
