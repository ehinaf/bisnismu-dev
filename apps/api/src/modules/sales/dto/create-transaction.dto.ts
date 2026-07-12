import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { order_type } from "@bisnismu/db";
import { CreateTransactionItemDto } from "./create-transaction-item.dto";
import { CreateTransactionPaymentDto } from "./create-transaction-payment.dto";

export class CreateTransactionDto {
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
  delivery_address?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  delivery_fee?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionItemDto)
  items!: CreateTransactionItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionPaymentDto)
  payments!: CreateTransactionPaymentDto[];
}
