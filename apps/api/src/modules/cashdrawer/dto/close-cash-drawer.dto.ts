import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CloseCashDrawerDto {
  @IsNumber()
  @Min(0)
  closing_balance!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
