import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  sku_suffix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  barcode?: string;

  @IsOptional()
  @IsNumber()
  price_adjustment?: number;

  @IsOptional()
  @IsNumber()
  cost_adjustment?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
