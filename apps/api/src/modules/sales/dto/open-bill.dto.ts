import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { order_type } from "@bisnismu/db";
import { CreateTransactionItemDto } from "./create-transaction-item.dto";

export class OpenBillDto {
  @IsUUID()
  outlet_id!: string;

  @IsOptional()
  @IsUUID()
  customer_id?: string;

  @IsOptional()
  @IsUUID()
  dining_table_id?: string;

  @IsOptional()
  @IsEnum(order_type)
  order_type?: order_type;

  @IsOptional()
  @IsNumber()
  @Min(1)
  guest_count?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  // Boleh kosong — buka bill dulu, pesanan menyusul lewat POST /transactions/:id/items
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionItemDto)
  items?: CreateTransactionItemDto[];
}
