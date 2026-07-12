import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { PaymentChannelService } from "./payment-channel.service";

@UseGuards(JwtAuthGuard)
@Controller("tenant/payment-channels")
export class PaymentChannelController {
  constructor(private readonly paymentChannelService: PaymentChannelService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.paymentChannelService.list(user.business_id);
  }
}
