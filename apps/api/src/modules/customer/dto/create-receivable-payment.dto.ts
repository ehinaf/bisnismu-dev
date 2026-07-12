import { IsOptional, IsNumber, IsPositive, IsString, MaxLength } from "class-validator";

export class CreateReceivablePaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  payment_method?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
