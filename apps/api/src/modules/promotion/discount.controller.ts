import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { DiscountService } from "./discount.service";
import { CreateDiscountDto } from "./dto/create-discount.dto";
import { UpdateDiscountDto } from "./dto/update-discount.dto";

@UseGuards(JwtAuthGuard)
@Controller("promotion/discounts")
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.discountService.list(user.business_id);
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.discountService.getOne(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDiscountDto) {
    return this.discountService.create(user.business_id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Patch(":id")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateDiscountDto) {
    return this.discountService.update(user.business_id, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Delete(":id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.discountService.softDelete(user.business_id, id);
  }
}
