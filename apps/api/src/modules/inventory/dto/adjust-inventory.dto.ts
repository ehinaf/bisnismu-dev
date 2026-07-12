import { IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";

export class AdjustInventoryDto {
  @IsUUID()
  outlet_id!: string;

  @IsUUID()
  item_id!: string;

  @IsOptional()
  @IsUUID()
  variant_id?: string;

  @IsNumber()
  @Min(0)
  new_quantity!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}
