import { Module } from "@nestjs/common";
import { DiscountController } from "./discount.controller";
import { DiscountService } from "./discount.service";
import { VoucherController } from "./voucher.controller";
import { VoucherService } from "./voucher.service";

@Module({
  controllers: [DiscountController, VoucherController],
  providers: [DiscountService, VoucherService],
})
export class PromotionModule {}
