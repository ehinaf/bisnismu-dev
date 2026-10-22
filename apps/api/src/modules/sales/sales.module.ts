import { Module } from "@nestjs/common";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";
import { PublicModule } from "../public/public.module";

@Module({
  imports: [PublicModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
