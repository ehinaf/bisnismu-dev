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

  /** Selisih dari harga dasar item (boleh negatif, mis. ukuran kecil lebih murah). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  price_adjustment?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  cost_adjustment?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
