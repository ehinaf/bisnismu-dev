import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterBusinessDto {
  @IsString()
  @MinLength(2)
  business_name!: string;

  @IsOptional()
  @IsString()
  business_type?: string;

  @IsString()
  @MinLength(2)
  owner_name!: string;

  @IsEmail()
  owner_email!: string;

  @IsString()
  @MinLength(8)
  owner_password!: string;
}
