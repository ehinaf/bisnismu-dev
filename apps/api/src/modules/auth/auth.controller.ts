import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterBusinessDto } from "./dto/register-business.dto";
import { LoginDto } from "./dto/login.dto";
import { LoginPinDto } from "./dto/login-pin.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import type { AuthTokens } from "./auth.service";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setRefreshCookie(res: Response, tokens: AuthTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
  }

  @Post("register")
  async register(@Body() dto: RegisterBusinessDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.registerBusiness(dto);
    this.setRefreshCookie(res, tokens);
    return { user, accessToken: tokens.accessToken };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.login(dto);
    this.setRefreshCookie(res, tokens);
    return { user, accessToken: tokens.accessToken };
  }

  @Post("login-pin")
  @HttpCode(HttpStatus.OK)
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
    const tokens = await this.authService.refresh(token);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("owner")
  @Get("owner-only")
  ownerOnly(@CurrentUser() user: JwtPayload) {
    return { message: "Akses owner diizinkan", user };
  }
}
