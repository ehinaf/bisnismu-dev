import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, Min } from "class-validator";
import { discount_type } from "@bisnismu/db";

// code tidak bisa diubah setelah dibuat (biar tetap konsisten dengan voucher yang sudah
// diedarkan); usage_count murni terkelola sistem lewat redemption, bukan lewat endpoint ini.
export class UpdateVoucherDto {
  @IsOptional()
  @IsEnum(discount_type)
  discount_type?: discount_type;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_purchase?: number;

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
