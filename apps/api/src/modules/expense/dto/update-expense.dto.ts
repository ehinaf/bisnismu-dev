import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class UpdateExpenseDto {
  @IsOptional()
  @IsUUID()
  outlet_id?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  expense_date?: string;

  @IsOptional()
  @IsString()
  receipt_url?: string;
}
