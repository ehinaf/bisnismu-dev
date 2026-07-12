import { SetMetadata } from "@nestjs/common";
import type { user_role } from "@bisnismu/db";

export const ROLES_KEY = "roles";
export const Roles = (...roles: user_role[]) => SetMetadata(ROLES_KEY, roles);
