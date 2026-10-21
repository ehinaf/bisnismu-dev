import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../prisma/prisma.service";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { hasPermission, type PermissionKey } from "../permissions/permissions";
import type { JwtPayload } from "../interfaces/jwt-payload.interface";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const user: JwtPayload | undefined = context.switchToHttp().getRequest().user;
    return !!user && hasPermission(this.prisma, user, required);
  }
}
