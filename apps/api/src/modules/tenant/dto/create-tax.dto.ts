import { IsIn, IsNumber, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export const TAX_KINDS = ["tax", "service_charge"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];

export class CreateTaxDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /** Persen atas subtotal, mis. 11 untuk PPN 11% (kolom NUMERIC(5,2)). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  rate!: number;

  @IsIn(TAX_KINDS)
  tax_kind!: TaxKind;
}
