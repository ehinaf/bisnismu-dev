import { IsOptional, IsString } from "class-validator";

// Pratinjau total open bill bila ditutup SEKARANG (diskon otomatis dievaluasi
// pada saat ini, sama seperti POST /transactions/:id/close).
export class QuoteBillDto {
  @IsOptional()
  @IsString()
  voucher_code?: string;
}
