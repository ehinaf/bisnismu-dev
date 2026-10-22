import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { STAFF_ROLES, type StaffRole } from "../staff-roles";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  /** Reset password oleh pemilik/admin — pengguna tidak perlu password lama. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
