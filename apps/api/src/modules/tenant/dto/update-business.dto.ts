import { IsEmail, IsOptional, IsString, IsTimeZone, MaxLength } from "class-validator";

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  business_type?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  // Zona waktu IANA (Asia/Jakarta, Asia/Makassar, Asia/Jayapura) — dipakai untuk
  // tanggal nomor struk, jadwal promo, dan batas hari laporan. Singkatan "WIB" ditolak.
  @IsOptional()
  @IsTimeZone()
  @MaxLength(50)
  timezone?: string;
}
