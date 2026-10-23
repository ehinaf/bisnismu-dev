import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { TAX_KINDS, type TaxKind } from "./create-tax.dto";

export class UpdateTaxDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  rate?: number;

  @IsOptional()
  @IsIn(TAX_KINDS)
  tax_kind?: TaxKind;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
