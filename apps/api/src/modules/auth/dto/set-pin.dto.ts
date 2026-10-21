import { IsString, Matches, MinLength } from "class-validator";

export class SetPinDto {
  @IsString()
  @MinLength(1)
  current_password!: string;

  @Matches(/^\d{4,6}$/, { message: "PIN harus 4–6 digit angka" })
  pin!: string;
}
