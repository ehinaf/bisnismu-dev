import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { VoucherService } from "./voucher.service";
import { CreateVoucherDto } from "./dto/create-voucher.dto";
import { UpdateVoucherDto } from "./dto/update-voucher.dto";

@UseGuards(JwtAuthGuard)
@Controller("promotion/vouchers")
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.voucherService.list(user.business_id);
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.voucherService.getOne(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateVoucherDto) {
    return this.voucherService.create(user.business_id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Patch(":id")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateVoucherDto) {
    return this.voucherService.update(user.business_id, id, dto);
  }
}
