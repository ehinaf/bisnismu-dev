import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MaxLength, MinLength } from "class-validator";
import { item_type, pricing_type } from "@bisnismu/db";

export class CreateItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsUUID()
  unit_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  barcode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(item_type)
  item_type?: item_type;

  @IsOptional()
  @IsEnum(pricing_type)
  pricing_type?: pricing_type;

  @IsNumber()
  @Min(0)
  base_price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost_price?: number;

  @IsOptional()
  @IsBoolean()
  track_stock?: boolean;

  @IsOptional()
  @IsBoolean()
  use_recipe?: boolean;

  @IsOptional()
  @IsString()
  image_url?: string;
}
