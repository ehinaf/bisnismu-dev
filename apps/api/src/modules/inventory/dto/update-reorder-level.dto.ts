import { IsNumber, IsOptional, IsUUID, Min } from "class-validator";

export class UpdateReorderLevelDto {
  @IsUUID()
  outlet_id!: string;

  @IsUUID()
  item_id!: string;

  @IsOptional()
  @IsUUID()
  variant_id?: string;

  /** Stok ≤ batas ini dianggap menipis (kolom NUMERIC(14,3)). */
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  reorder_level!: number;
}
