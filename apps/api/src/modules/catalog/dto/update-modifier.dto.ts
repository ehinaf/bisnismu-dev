import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class UpdateModifierDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsNumber()
  price_adjustment?: number;

  @IsOptional()
  @IsUUID()
  ingredient_item_id?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  ingredient_qty?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
