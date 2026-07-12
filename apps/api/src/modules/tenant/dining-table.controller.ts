import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { DiningTableService } from "./dining-table.service";
import { CreateDiningTableDto } from "./dto/create-dining-table.dto";
import { UpdateDiningTableDto } from "./dto/update-dining-table.dto";

@UseGuards(JwtAuthGuard)
@Controller("tenant/outlets/:outletId/tables")
export class DiningTableController {
  constructor(private readonly diningTableService: DiningTableService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Param("outletId") outletId: string) {
    return this.diningTableService.list(user.business_id, outletId);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post()
  create(@CurrentUser() user: JwtPayload, @Param("outletId") outletId: string, @Body() dto: CreateDiningTableDto) {
    return this.diningTableService.create(user.business_id, outletId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Patch(":id")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("outletId") outletId: string,
    @Param("id") id: string,
    @Body() dto: UpdateDiningTableDto,
  ) {
    return this.diningTableService.update(user.business_id, outletId, id, dto);
  }
}
