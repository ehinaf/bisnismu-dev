import { IsNumber, IsOptional, IsPositive, Min } from "class-validator";

export class UpdatePriceTierDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  min_qty?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  max_qty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}
