import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { CreateTransactionItemDto } from "./create-transaction-item.dto";

// Pratinjau harga keranjang (tanpa menyimpan apa pun) — dipakai layar kasir
// untuk menampilkan total final (diskon otomatis, voucher, pajak, pembulatan)
// SEBELUM pembayaran diinput, dengan aturan yang sama persis dengan POST /transactions.
export class QuoteTransactionDto {
  @IsUUID()
  outlet_id!: string;

  // Dibutuhkan untuk cek per_customer_limit voucher.
  @IsOptional()
  @IsUUID()
  customer_id?: string;

  @IsOptional()
  @IsString()
  voucher_code?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  delivery_fee?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionItemDto)
  items!: CreateTransactionItemDto[];
}
