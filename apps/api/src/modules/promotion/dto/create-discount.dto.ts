import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsObject, IsOptional, IsString, Min, MaxLength, MinLength } from "class-validator";
import { discount_type, discount_scope } from "@bisnismu/db";

// conditions (JSONB, bebas bentuk sesuai scope):
// { category_ids?: string[], item_ids?: string[], min_amount?: number,
//   days_of_week?: number[] (0=Minggu..6=Sabtu), hour_start?: "HH:MM", hour_end?: "HH:MM" }
export class CreateDiscountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsEnum(discount_type)
  discount_type!: discount_type;

  @IsNumber()
  @Min(0)
  value!: number;

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
