import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class CreateTransactionItemDto {
  @IsUUID()
  item_id!: string;

  @IsOptional()
  @IsUUID()
  variant_id?: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsUUID()
  served_by?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
