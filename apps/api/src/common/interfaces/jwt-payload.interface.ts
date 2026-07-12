import type { user_role } from "@bisnismu/db";

export interface JwtPayload {
  sub: string;
  business_id: string;
  role: user_role;
  email: string | null;
}
