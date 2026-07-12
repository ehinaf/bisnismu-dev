import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { CreateTransactionPaymentDto } from "./create-transaction-payment.dto";

export class CloseBillDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionPaymentDto)
  payments!: CreateTransactionPaymentDto[];
}
