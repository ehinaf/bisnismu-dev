import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateModifierDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsNumber()
  price_adjustment?: number;

  // Modifier bisa mengurangi stok bahan sendiri (mis. topping keju) — independen
  // dari mekanisme stok item induknya (track_stock/use_recipe/bundle).
  @IsOptional()
  @IsUUID()
  ingredient_item_id?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  ingredient_qty?: number;
}
