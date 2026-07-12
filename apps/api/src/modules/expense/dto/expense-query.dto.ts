import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class ExpenseQueryDto {
  @IsOptional()
  @IsUUID()
  outlet_id?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
