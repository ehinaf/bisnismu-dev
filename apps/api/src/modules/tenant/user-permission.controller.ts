import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { UserPermissionService } from "./user-permission.service";
import { UpdateUserPermissionsDto } from "./dto/update-user-permissions.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner", "admin")
@Controller("tenant/users")
export class UserPermissionController {
  constructor(private readonly userPermissionService: UserPermissionService) {}

  @Get()
  listUsers(@CurrentUser() user: JwtPayload) {
    return this.userPermissionService.listUsers(user.business_id);
  }

  @Get(":id/permissions")
  list(@CurrentUser() user: JwtPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.userPermissionService.list(user.business_id, id);
  }

  @Put(":id/permissions")
  replace(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserPermissionsDto,
    @Ip() ip: string,
  ) {
    return this.userPermissionService.replace(user.business_id, id, dto, { userId: user.sub, ip });
  }
}
