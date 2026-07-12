import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { ModifierGroupService } from "./modifier-group.service";
import { ModifierService } from "./modifier.service";
import { CreateModifierGroupDto } from "./dto/create-modifier-group.dto";
import { UpdateModifierGroupDto } from "./dto/update-modifier-group.dto";
import { CreateModifierDto } from "./dto/create-modifier.dto";
import { UpdateModifierDto } from "./dto/update-modifier.dto";

@UseGuards(JwtAuthGuard)
@Controller("catalog/modifier-groups")
export class ModifierGroupController {
  constructor(
    private readonly modifierGroupService: ModifierGroupService,
    private readonly modifierService: ModifierService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.modifierGroupService.list(user.business_id);
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.modifierGroupService.getOne(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateModifierGroupDto) {
    return this.modifierGroupService.create(user.business_id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Patch(":id")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateModifierGroupDto) {
    return this.modifierGroupService.update(user.business_id, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Delete(":id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.modifierGroupService.softDelete(user.business_id, id);
  }

  @Get(":id/modifiers")
  listModifiers(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.modifierService.list(user.business_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Post(":id/modifiers")
  createModifier(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: CreateModifierDto) {
    return this.modifierService.create(user.business_id, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("owner", "admin", "manager")
  @Patch(":id/modifiers/:modifierId")
  updateModifier(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("modifierId") modifierId: string,
    @Body() dto: UpdateModifierDto,
  ) {
    return this.modifierService.update(user.business_id, id, modifierId, dto);
  }
}
