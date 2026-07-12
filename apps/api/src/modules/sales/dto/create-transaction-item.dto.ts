import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class CreateTransactionItemDto {
  @IsUUID()
  item_id!: string;

  @IsOptional()
  @IsUUID()
  variant_id?: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

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
