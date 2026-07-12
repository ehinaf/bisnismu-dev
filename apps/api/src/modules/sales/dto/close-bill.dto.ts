import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
import { CreateTransactionPaymentDto } from "./create-transaction-payment.dto";

export class CloseBillDto {
  // Kode voucher (opsional) — diskon otomatis terjadwal dievaluasi otomatis
  // di sisi server terhadap subtotal bill saat ditutup, tidak perlu disebut.
  @IsOptional()
  @IsString()
  voucher_code?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionPaymentDto)
  payments!: CreateTransactionPaymentDto[];
}
