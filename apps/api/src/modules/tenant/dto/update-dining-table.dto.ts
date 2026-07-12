import { IsEnum, IsInt, IsOptional, IsString, Min, MaxLength, MinLength } from "class-validator";
import { table_status } from "@bisnismu/db";

export class UpdateDiningTableDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  area?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsEnum(table_status)
  status?: table_status;
}
