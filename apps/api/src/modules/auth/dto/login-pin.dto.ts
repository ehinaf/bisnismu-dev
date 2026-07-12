import { IsString, IsUUID, Length } from "class-validator";

export class LoginPinDto {
  @IsUUID()
  business_id!: string;

  @IsString()
  @Length(4, 8)
  pin_code!: string;
}
