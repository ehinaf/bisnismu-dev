import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MaxLength, MinLength } from "class-validator";
import { modifier_selection_type } from "@bisnismu/db";

export class CreateModifierGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsEnum(modifier_selection_type)
  selection_type?: modifier_selection_type;

  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  min_select?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  max_select?: number;
}
