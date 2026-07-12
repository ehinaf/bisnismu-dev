import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { CashdrawerService } from "./cashdrawer.service";
import { OpenCashDrawerDto } from "./dto/open-cash-drawer.dto";
import { CloseCashDrawerDto } from "./dto/close-cash-drawer.dto";
import { CreateMovementDto } from "./dto/create-movement.dto";
import { OutletQueryDto } from "./dto/outlet-query.dto";

@UseGuards(JwtAuthGuard)
@Controller("cashdrawer")
export class CashdrawerController {
  constructor(private readonly cashdrawerService: CashdrawerService) {}

  @Get("current")
  getCurrent(@CurrentUser() user: JwtPayload, @Query() query: OutletQueryDto) {
    return this.cashdrawerService.getCurrent(user.business_id, query.outlet_id);
  }

  @Get("history")
  history(@CurrentUser() user: JwtPayload, @Query() query: OutletQueryDto) {
    return this.cashdrawerService.history(user.business_id, query.outlet_id);
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.cashdrawerService.getOne(user.business_id, id);
  }

  @Post("open")
  open(@CurrentUser() user: JwtPayload, @Body() dto: OpenCashDrawerDto) {
    return this.cashdrawerService.open(user.business_id, user.sub, dto);
  }

  @Post(":id/close")
  close(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: CloseCashDrawerDto) {
    return this.cashdrawerService.close(user.business_id, user.sub, id, dto);
  }

  @Post(":id/movements")
  addMovement(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: CreateMovementDto) {
    return this.cashdrawerService.addMovement(user.business_id, user.sub, id, dto);
  }
}
