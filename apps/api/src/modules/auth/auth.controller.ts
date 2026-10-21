import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Post, Put, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService, REFRESH_TOKEN_TTL_MS } from "./auth.service";
import { RegisterBusinessDto } from "./dto/register-business.dto";
import { LoginDto } from "./dto/login.dto";
import { LoginPinDto } from "./dto/login-pin.dto";
import { SetPinDto } from "./dto/set-pin.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import type { AuthTokens } from "./auth.service";

const REFRESH_COOKIE = "refresh_token";
// Batas ketat untuk endpoint yang menerima kredensial (tebak password/PIN).
const CREDENTIAL_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private cookieOptions() {
    return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
  }

  private setRefreshCookie(res: Response, tokens: AuthTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...this.cookieOptions(), maxAge: REFRESH_TOKEN_TTL_MS });
  }

  @Post("register")
  @Throttle(CREDENTIAL_THROTTLE)
  async register(@Body() dto: RegisterBusinessDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.registerBusiness(dto);
    this.setRefreshCookie(res, tokens);
    return { user, accessToken: tokens.accessToken };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.login(dto);
    this.setRefreshCookie(res, tokens);
    return { user, accessToken: tokens.accessToken };
  }

  @Post("login-pin")
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  async loginPin(@Body() dto: LoginPinDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.loginPin(dto);
    this.setRefreshCookie(res, tokens);
    return { user, accessToken: tokens.accessToken };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      throw new UnauthorizedException("Refresh token tidak ditemukan");
    }
    try {
      const tokens = await this.authService.refresh(token);
      this.setRefreshCookie(res, tokens);
      return { accessToken: tokens.accessToken };
    } catch (err) {
      // Token ditolak (kedaluwarsa/dicabut/dipakai ulang) — buang cookie-nya.
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  // Tanpa JwtAuthGuard: logout tetap jalan walau access token sudah kedaluwarsa.
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @UseGuards(JwtAuthGuard)
  @Put("pin")
  @Throttle(CREDENTIAL_THROTTLE)
  setPin(@CurrentUser() user: JwtPayload, @Body() dto: SetPinDto, @Ip() ip: string) {
    return this.authService.setPin(user, dto, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("owner")
  @Get("owner-only")
  ownerOnly(@CurrentUser() user: JwtPayload) {
    return { message: "Akses owner diizinkan", user };
  }
}
