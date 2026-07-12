import { Module } from "@nestjs/common";
import { BusinessController } from "./business.controller";
import { BusinessService } from "./business.service";
import { OutletController } from "./outlet.controller";
import { OutletService } from "./outlet.service";

@Module({
  controllers: [BusinessController, OutletController],
  providers: [BusinessService, OutletService],
})
export class TenantModule {}
