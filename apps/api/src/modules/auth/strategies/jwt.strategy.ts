import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../../prisma/prisma.service";
import type { JwtPayload } from "../../../common/interfaces/jwt-payload.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_ACCESS_SECRET")!,
    });
  }

  /**
   * Token valid saja tidak cukup: user dinonaktifkan/dihapus ditolak saat itu
   * juga, dan role diambil dari DB (bukan dari token) supaya perubahan role
   * langsung berlaku tanpa menunggu token kedaluwarsa.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, business_id: payload.business_id, deleted_at: null, is_active: true },
      select: { id: true, business_id: true, role: true, email: true },
    });
    if (!user) throw new UnauthorizedException("Akun tidak aktif");
    return { sub: user.id, business_id: user.business_id, role: user.role, email: user.email };
  }
}
