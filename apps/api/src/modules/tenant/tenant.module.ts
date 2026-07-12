import { Module } from "@nestjs/common";
import { BusinessController } from "./business.controller";
import { BusinessService } from "./business.service";
import { OutletController } from "./outlet.controller";
import { OutletService } from "./outlet.service";
import { PaymentChannelController } from "./payment-channel.controller";
import { PaymentChannelService } from "./payment-channel.service";
import { DiningTableController } from "./dining-table.controller";
import { DiningTableService } from "./dining-table.service";

@Module({
  controllers: [BusinessController, OutletController, PaymentChannelController, DiningTableController],
  providers: [BusinessService, OutletService, PaymentChannelService, DiningTableService],
})
export class TenantModule {}
