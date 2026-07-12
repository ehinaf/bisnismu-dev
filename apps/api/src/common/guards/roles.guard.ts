import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { user_role } from "@bisnismu/db";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { JwtPayload } from "../interfaces/jwt-payload.interface";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<user_role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload | undefined = request.user;
    return !!user && requiredRoles.includes(user.role);
  }
}
