import { IsArray, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class CreateTransactionItemDto {
  @IsUUID()
  item_id!: string;

  @IsOptional()
  @IsUUID()
  variant_id?: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  // Modifier terpilih untuk baris ini (topping, level pedas, dst).
  // Divalidasi server-side terhadap modifier_groups yang terpasang di item ini.
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  modifier_ids?: string[];

  // Hanya dipakai (dan WAJIB) untuk item dengan pricing_type='open' — kasir
  // input harga manual (jasa custom, barang bekas). Untuk pricing_type lain
  // field ini diabaikan sepenuhnya; harga selalu dihitung server-side.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  unit_price?: number;

  @IsOptional()
  @IsUUID()
  served_by?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
