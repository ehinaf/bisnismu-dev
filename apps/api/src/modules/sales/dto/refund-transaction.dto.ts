import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class RefundLineDto {
  @IsUUID()
  transaction_item_id!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity!: number;

  // Barang fisik dikembalikan ke stok (default true). Diabaikan untuk menu
  // resep/paket — bahannya sudah terpakai.
  @IsOptional()
  @IsBoolean()
  restock?: boolean;
}

export class RefundQuoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundLineDto)
  lines!: RefundLineDto[];
}

export class RefundTransactionDto extends RefundQuoteDto {
  // Idempotency key — retry setelah koneksi putus tidak membuat refund ganda.
  @IsOptional()
  @IsUUID()
  client_ref?: string;

  // Kanal uang keluar (Tunai = dari laci shift yang sedang buka).
  @IsUUID()
  payment_channel_id!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;
}
