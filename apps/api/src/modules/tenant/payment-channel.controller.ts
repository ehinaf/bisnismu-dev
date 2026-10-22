import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { PaymentChannelService } from "./payment-channel.service";
import { CreatePaymentChannelDto } from "./dto/create-payment-channel.dto";
import { UpdatePaymentChannelDto } from "./dto/update-payment-channel.dto";

@UseGuards(JwtAuthGuard)
@Controller("tenant/payment-channels")
export class PaymentChannelController {
  constructor(private readonly paymentChannelService: PaymentChannelService) {}

  /** `?all=1` (pemilik/admin) ikut menampilkan metode nonaktif untuk halaman Pengaturan. */
  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("all") all?: string) {
    const includeInactive = all === "1" && (user.role === "owner" || user.role === "admin");
    return this.paymentChannelService.list(user.business_id, includeInactive);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin")
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePaymentChannelDto, @Ip() ip: string) {
    return this.paymentChannelService.create(user.business_id, dto, { userId: user.sub, ip });
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin")
  @Patch(":id")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentChannelDto,
    @Ip() ip: string,
  ) {
    return this.paymentChannelService.update(user.business_id, id, dto, { userId: user.sub, ip });
  }
}
