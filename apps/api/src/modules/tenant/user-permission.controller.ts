import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { UserPermissionService } from "./user-permission.service";
import { UpdateUserPermissionsDto } from "./dto/update-user-permissions.dto";
import { UserService } from "./user.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { SetUserPinDto } from "./dto/set-user-pin.dto";
import { Throttle } from "@nestjs/throttler";
import { CREDENTIAL_THROTTLE } from "../auth/pin";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner", "admin")
@Controller("tenant/users")
export class UserPermissionController {
  constructor(
    private readonly userPermissionService: UserPermissionService,
    private readonly userService: UserService,
  ) {}

  @Get()
  listUsers(@CurrentUser() user: JwtPayload) {
    return this.userPermissionService.listUsers(user.business_id);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto, @Ip() ip: string) {
    return this.userService.create(user, dto, { userId: user.sub, ip });
  }

  @Patch(":id")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Ip() ip: string,
  ) {
    return this.userService.update(user, id, dto, { userId: user.sub, ip });
  }

  @Put(":id/pin")
  @Throttle(CREDENTIAL_THROTTLE)
  setPin(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetUserPinDto,
    @Ip() ip: string,
  ) {
    return this.userService.setPin(user, id, dto.pin, { userId: user.sub, ip });
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
