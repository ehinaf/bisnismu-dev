import { IsNumber, IsOptional, IsPositive, IsUUID, Min } from "class-validator";

export class CreatePriceTierDto {
  @IsOptional()
  @IsUUID()
  variant_id?: string;

  @IsNumber()
  @IsPositive()
  min_qty!: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  max_qty?: number;

  @IsNumber()
  @Min(0)
  price!: number;
}
