import { IsOptional, IsUUID } from "class-validator";

export class OutletQueryDto {
  @IsUUID()
  outlet_id!: string;

  @IsOptional()
  @IsUUID()
  item_id?: string;
}
