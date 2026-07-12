import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, MaxLength, MinLength } from "class-validator";
import { discount_type } from "@bisnismu/db";

export class CreateVoucherDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code!: string;

  @IsEnum(discount_type)
  discount_type!: discount_type;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_purchase?: number;

  // Batas maksimal potongan — hanya berarti untuk discount_type='percentage'
  @IsOptional()
  @IsNumber()
  @IsPositive()
  max_discount?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  usage_limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  per_customer_limit?: number;

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
