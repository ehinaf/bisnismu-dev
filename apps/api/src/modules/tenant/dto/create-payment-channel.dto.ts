import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export const CHANNEL_TYPES = ["cash", "qris", "e_wallet", "bank_transfer", "debit", "credit"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export class CreatePaymentChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsIn(CHANNEL_TYPES)
  channel_type!: ChannelType;

  /** MDR dalam persen, mis. 0.7 untuk QRIS 0,7% (kolom NUMERIC(5,3)). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  fee_percentage?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee_fixed?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}
