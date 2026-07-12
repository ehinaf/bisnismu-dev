import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { rounding_mode } from "@bisnismu/db";

export class UpdateBusinessSettingsDto {
  @IsOptional()
  @IsString()
  receipt_header?: string;

  @IsOptional()
  @IsString()
  receipt_footer?: string;

  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsUUID()
  default_tax_id?: string;

  @IsOptional()
  @IsEnum(rounding_mode)
  rounding?: rounding_mode;

  @IsOptional()
  @IsBoolean()
  low_stock_alert?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_tables?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_bookings?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_kasbon?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_loyalty?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_commission?: boolean;

  @IsOptional()
  @IsBoolean()
  receipt_via_whatsapp?: boolean;
}
