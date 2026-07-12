import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { OutletService } from "./outlet.service";
import { CreateOutletDto } from "./dto/create-outlet.dto";
import { UpdateOutletDto } from "./dto/update-outlet.dto";

@UseGuards(JwtAuthGuard)
@Controller("tenant/outlets")
export class OutletController {
  constructor(private readonly outletService: OutletService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.outletService.list(user.business_id);
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.outletService.getOne(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin")
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateOutletDto) {
    return this.outletService.create(user.business_id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin")
  @Patch(":id")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateOutletDto) {
    return this.outletService.update(user.business_id, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin")
  @Delete(":id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.outletService.softDelete(user.business_id, id);
  }
}
