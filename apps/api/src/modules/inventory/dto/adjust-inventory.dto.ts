import { IsNumber, IsOptional, IsString, IsUUID, Min, MinLength, ValidateIf } from "class-validator";

/**
 * Isi tepat salah satu:
 * - `new_quantity`: hasil hitung fisik / stok awal (jumlah akhir);
 * - `delta`: barang masuk (+) atau keluar (−). Dihitung di server di bawah kunci
 *   baris, jadi penjualan yang terjadi bersamaan tidak tertimpa.
 */
export class AdjustInventoryDto {
  @IsUUID()
  outlet_id!: string;

  @IsUUID()
  item_id!: string;

  @IsOptional()
  @IsUUID()
  variant_id?: string;

  @ValidateIf((o: AdjustInventoryDto) => o.delta === undefined)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  new_quantity?: number;

  @ValidateIf((o: AdjustInventoryDto) => o.new_quantity === undefined)
  @IsNumber({ maxDecimalPlaces: 3 })
  delta?: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}
