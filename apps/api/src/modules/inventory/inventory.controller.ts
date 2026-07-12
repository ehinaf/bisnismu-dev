import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { InventoryService } from "./inventory.service";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";
import { OutletQueryDto } from "./dto/outlet-query.dto";

@UseGuards(JwtAuthGuard)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() query: OutletQueryDto) {
    return this.inventoryService.list(user.business_id, query.outlet_id);
  }

  @Get("low-stock")
  lowStock(@CurrentUser() user: JwtPayload, @Query() query: OutletQueryDto) {
    return this.inventoryService.lowStock(user.business_id, query.outlet_id);
  }

  @Get("movements")
  movements(@CurrentUser() user: JwtPayload, @Query() query: OutletQueryDto) {
    return this.inventoryService.movements(user.business_id, query.outlet_id, query.item_id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post("adjust")
  adjust(@CurrentUser() user: JwtPayload, @Body() dto: AdjustInventoryDto) {
    return this.inventoryService.adjust(user.business_id, user.sub, dto);
  }
}
