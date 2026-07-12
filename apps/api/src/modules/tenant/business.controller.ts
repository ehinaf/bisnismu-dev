import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { BusinessService } from "./business.service";
import { UpdateBusinessDto } from "./dto/update-business.dto";
import { UpdateBusinessSettingsDto } from "./dto/update-business-settings.dto";

@UseGuards(JwtAuthGuard)
@Controller("tenant")
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get("business")
  getBusiness(@CurrentUser() user: JwtPayload) {
    return this.businessService.getBusiness(user.business_id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin")
  @Patch("business")
  updateBusiness(@CurrentUser() user: JwtPayload, @Body() dto: UpdateBusinessDto) {
    return this.businessService.updateBusiness(user.business_id, dto);
  }

  @Get("settings")
  getSettings(@CurrentUser() user: JwtPayload) {
    return this.businessService.getSettings(user.business_id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin")
  @Patch("settings")
  updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateBusinessSettingsDto) {
    return this.businessService.updateSettings(user.business_id, dto);
  }
}
