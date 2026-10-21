import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class ListTransactionsQueryDto {
  @IsUUID()
  outlet_id!: string;

  // Tanggal kalender usaha (YYYY-MM-DD); default hari ini di zona waktu usaha.
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}
