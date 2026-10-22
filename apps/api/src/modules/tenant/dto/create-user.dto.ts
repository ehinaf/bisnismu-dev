import { IsEmail, IsIn, IsString, MaxLength, MinLength } from "class-validator";
import { STAFF_ROLES, type StaffRole } from "../staff-roles";

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsEmail()
  @MaxLength(150)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(STAFF_ROLES)
  role!: StaffRole;
}
