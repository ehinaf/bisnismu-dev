import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { User } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { RegisterBusinessDto } from "./dto/register-business.dto";
import { LoginDto } from "./dto/login.dto";
import { LoginPinDto } from "./dto/login-pin.dto";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type SafeUser = Omit<User, "password_hash" | "pin_code">;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private sanitize(user: User): SafeUser {
    const { password_hash: _password_hash, pin_code: _pin_code, ...safe } = user;
    return safe;
  }

  private issueTokens(user: User): AuthTokens {
    const payload: JwtPayload = {
      sub: user.id,
      business_id: user.business_id,
      role: user.role,
      email: user.email,
    };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>("JWT_ACCESS_SECRET"),
      // expiresIn di @nestjs/jwt mengharap literal type `ms.StringValue`; nilai kita
      // datang dari .env jadi cast ke `number | StringValue` di sini aman.
      expiresIn: (this.config.get<string>("JWT_ACCESS_EXPIRES_IN") ?? "15m") as number | `${number}${"s" | "m" | "h" | "d"}`,
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get<string>("JWT_REFRESH_SECRET"),
      expiresIn: (this.config.get<string>("JWT_REFRESH_EXPIRES_IN") ?? "7d") as number | `${number}${"s" | "m" | "h" | "d"}`,
    });
    return { accessToken, refreshToken };
  }

  async registerBusiness(dto: RegisterBusinessDto): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.owner_email, deleted_at: null },
    });
    if (existing) {
      throw new ConflictException("Email sudah terdaftar");
    }

    const password_hash = await argon2.hash(dto.owner_password, { type: argon2.argon2id });

    const user = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: dto.business_name,
          business_type: dto.business_type,
        },
      });
      await tx.businessSetting.create({
        data: { business_id: business.id },
      });
      return tx.user.create({
        data: {
          business_id: business.id,
          name: dto.owner_name,
          email: dto.owner_email,
          password_hash,
          role: "owner",
        },
      });
    });

    return { user: this.sanitize(user), tokens: this.issueTokens(user) };
  }

  async login(dto: LoginDto): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deleted_at: null, is_active: true },
    });
    if (!user || !(await argon2.verify(user.password_hash, dto.password))) {
      throw new UnauthorizedException("Email atau password salah");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    return { user: this.sanitize(user), tokens: this.issueTokens(user) };
  }

  async loginPin(dto: LoginPinDto): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const candidates = await this.prisma.user.findMany({
      where: {
        business_id: dto.business_id,
        deleted_at: null,
        is_active: true,
        pin_code: { not: null },
      },
    });

    let matched: User | null = null;
    for (const candidate of candidates) {
      if (candidate.pin_code && (await argon2.verify(candidate.pin_code, dto.pin_code))) {
        matched = candidate;
        break;
      }
    }
    if (!matched) {
      throw new UnauthorizedException("PIN salah");
    }

    await this.prisma.user.update({
      where: { id: matched.id },
      data: { last_login_at: new Date() },
    });

    return { user: this.sanitize(matched), tokens: this.issueTokens(matched) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Refresh token tidak valid");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deleted_at: null, is_active: true },
    });
    if (!user) {
      throw new UnauthorizedException("User tidak ditemukan");
    }

    return this.issueTokens(user);
  }
}
