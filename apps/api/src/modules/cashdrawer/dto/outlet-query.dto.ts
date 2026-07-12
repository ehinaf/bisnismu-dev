import { IsUUID } from "class-validator";

export class OutletQueryDto {
  @IsUUID()
  outlet_id!: string;
}
