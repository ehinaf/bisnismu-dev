import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateUnitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  symbol!: string;

  @IsOptional()
  @IsBoolean()
  allow_decimal?: boolean;
}
