import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class CreateTransactionPaymentDto {
  @IsUUID()
  payment_channel_id!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  reference_number?: string;

  // TRUE = porsi ini dibayar sebagai kasbon/piutang, bukan uang tunai diterima sekarang.
  @IsOptional()
  @IsBoolean()
  is_receivable?: boolean;
}
