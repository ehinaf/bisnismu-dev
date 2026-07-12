import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsObject, IsOptional, IsString, Min, MaxLength, MinLength } from "class-validator";
import { discount_type, discount_scope } from "@bisnismu/db";

export class UpdateDiscountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(discount_type)
  discount_type?: discount_type;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsEnum(discount_scope)
  scope?: discount_scope;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
