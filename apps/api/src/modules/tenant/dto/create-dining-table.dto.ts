import { IsInt, IsOptional, IsString, Min, MaxLength, MinLength } from "class-validator";

export class CreateDiningTableDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  area?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
