import { IsEnum, IsNumber, IsPositive, IsString, MaxLength, MinLength } from "class-validator";
import { cash_flow_type } from "@bisnismu/db";

export class CreateMovementDto {
  @IsEnum(cash_flow_type)
  flow_type!: cash_flow_type;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  reason!: string;
}
