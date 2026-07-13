import { Module } from "@nestjs/common";
import { BusinessController } from "./business.controller";
import { BusinessService } from "./business.service";
import { OutletController } from "./outlet.controller";
import { OutletService } from "./outlet.service";
import { PaymentChannelController } from "./payment-channel.controller";
import { PaymentChannelService } from "./payment-channel.service";
import { DiningTableController } from "./dining-table.controller";
import { DiningTableService } from "./dining-table.service";
import { TaxController } from "./tax.controller";
import { TaxService } from "./tax.service";

@Module({
  controllers: [BusinessController, OutletController, PaymentChannelController, DiningTableController, TaxController],
  providers: [BusinessService, OutletService, PaymentChannelService, DiningTableService, TaxService],
})
export class TenantModule {}
