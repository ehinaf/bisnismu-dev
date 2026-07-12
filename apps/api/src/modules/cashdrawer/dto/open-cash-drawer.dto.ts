import { IsNumber, IsOptional, IsUUID, Min } from "class-validator";

export class OpenCashDrawerDto {
  @IsUUID()
  outlet_id!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  opening_balance?: number;
}
