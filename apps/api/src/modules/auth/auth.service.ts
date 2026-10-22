import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { User } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { effectivePermissions } from "../../common/permissions/permissions";
import { AUDIT_ACTIONS, writeAuditLog } from "../../common/audit/audit-log";
import { RegisterBusinessDto } from "./dto/register-business.dto";
import { LoginDto } from "./dto/login.dto";
import { LoginPinDto } from "./dto/login-pin.dto";
import { SetPinDto } from "./dto/set-pin.dto";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type SafeUser = Omit<User, "password_hash" | "pin_code">;

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Dua tab / request paralel bisa me-refresh dengan token yang sama hampir
// bersamaan; dalam jendela ini token lama masih dilayani (family yang sama).
export const REFRESH_ROTATION_GRACE_MS = 30_000;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MS = 5 * 60_000;

// Belum ada CRUD metode pembayaran — tanpa ini bisnis baru tidak bisa berjualan.
// Biaya QRIS 0: MDR usaha mikro untuk transaksi ≤ Rp500rb memang 0%.
export const DEFAULT_PAYMENT_CHANNELS = [
  { name: "Tunai", channel_type: "cash", sort_order: 1 },
  { name: "QRIS", channel_type: "qris", sort_order: 2 },
  { name: "Transfer Bank", channel_type: "bank_transfer", sort_order: 3 },
];

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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

  /**
   * Access token = JWT pendek. Refresh token = string acak opaque; yang disimpan
   * hanya hash-nya, jadi bocornya isi tabel tidak memberi token yang bisa dipakai.
   * familyId sama = sesi login yang sama (rotasi), baru = login baru.
   */
  private async issueTokens(user: User, familyId: string = randomUUID()): Promise<AuthTokens> {
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
    const refreshToken = randomBytes(32).toString("base64url");
    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,
        family_id: familyId,
        token_hash: hashToken(refreshToken),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return { accessToken, refreshToken };
  }

  private revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { family_id: familyId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
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
      await tx.paymentChannel.createMany({
        data: DEFAULT_PAYMENT_CHANNELS.map((c) => ({ ...c, business_id: business.id })),
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

    return { user: this.sanitize(user), tokens: await this.issueTokens(user) };
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

    return { user: this.sanitize(user), tokens: await this.issueTokens(user) };
  }

  /**
   * Login cepat kasir. PIN tidak menunjuk user sebelum cocok, jadi percobaan
   * gagal dihitung per BISNIS: PIN_MAX_ATTEMPTS salah → login PIN bisnis itu
   * dikunci PIN_LOCK_MS (login email/password tetap bisa dipakai).
   */
  async loginPin(dto: LoginPinDto): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const now = new Date();
    const settings = await this.prisma.businessSetting.findUnique({ where: { business_id: dto.business_id } });
    if (settings?.pin_locked_until && settings.pin_locked_until > now) {
      const minutes = Math.ceil((settings.pin_locked_until.getTime() - now.getTime()) / 60_000);
      throw new HttpException(
        `Login PIN dikunci sementara karena terlalu banyak PIN salah. Coba lagi dalam ${minutes} menit, atau masuk dengan email & password.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

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
      if (settings) await this.registerPinFailure(dto.business_id, now);
      throw new UnauthorizedException("PIN salah");
    }

    if (settings && (settings.pin_failed_attempts > 0 || settings.pin_locked_until)) {
      await this.prisma.businessSetting.update({
        where: { business_id: dto.business_id },
        data: { pin_failed_attempts: 0, pin_locked_until: null },
      });
    }
    await this.prisma.user.update({
      where: { id: matched.id },
      data: { last_login_at: new Date() },
    });

    return { user: this.sanitize(matched), tokens: await this.issueTokens(matched) };
  }

  private async registerPinFailure(businessId: string, now: Date) {
    // Increment atomik di DB (bukan baca-tambah-tulis) supaya percobaan paralel tetap terhitung semua.
    const updated = await this.prisma.businessSetting.update({
      where: { business_id: businessId },
      data: { pin_failed_attempts: { increment: 1 } },
    });
    if (updated.pin_failed_attempts >= PIN_MAX_ATTEMPTS) {
      await this.prisma.businessSetting.update({
        where: { business_id: businessId },
        data: { pin_failed_attempts: 0, pin_locked_until: new Date(now.getTime() + PIN_LOCK_MS) },
      });
    }
  }

  /** Data user dari token + izin efektif dari DB (untuk menampilkan/menyembunyikan aksi di UI). */
  async me(user: JwtPayload) {
    return { ...user, permissions: await effectivePermissions(this.prisma, user) };
  }

  /**
   * Rotasi refresh token: token yang dipakai ditandai replaced_at dan diganti
   * token baru di family yang sama. Token lama yang dipakai lagi setelah masa
   * tenggang (atau token yang sudah dicabut) = indikasi dicuri → seluruh family
   * dicabut, pemilik sah pun harus login ulang.
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const now = new Date();
    const record = await this.prisma.refreshToken.findUnique({
      where: { token_hash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!record || record.expires_at <= now) {
      throw new UnauthorizedException("Refresh token tidak valid");
    }

    const reused =
      record.revoked_at !== null ||
      (record.replaced_at !== null && now.getTime() - record.replaced_at.getTime() > REFRESH_ROTATION_GRACE_MS);
    if (reused) {
      await this.revokeFamily(record.family_id);
      throw new UnauthorizedException("Sesi tidak valid, silakan login ulang");
    }

    if (!record.user.is_active || record.user.deleted_at) {
      await this.revokeFamily(record.family_id);
      throw new UnauthorizedException("User tidak ditemukan");
    }

    await this.prisma.refreshToken.updateMany({
      where: { id: record.id, replaced_at: null },
      data: { replaced_at: now },
    });
    return this.issueTokens(record.user, record.family_id);
  }

  /** Cabut seluruh sesi (family) milik refresh token ini. Token tak dikenal diabaikan. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const record = await this.prisma.refreshToken.findUnique({ where: { token_hash: hashToken(refreshToken) } });
    if (record) await this.revokeFamily(record.family_id);
  }

  /**
   * Atur PIN sendiri (konfirmasi password). PIN wajib unik di dalam bisnis karena
   * login PIN mencari user dari PIN-nya. Hash argon2 ber-salt tidak bisa dibuat
   * UNIQUE di DB, jadi dicek dengan verify terhadap PIN user aktif lain.
   */
  async setPin(actor: JwtPayload, dto: SetPinDto, ip: string | null = null): Promise<{ ok: true }> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.sub, business_id: actor.business_id, deleted_at: null, is_active: true },
    });
    if (!user || !(await argon2.verify(user.password_hash, dto.current_password))) {
      throw new UnauthorizedException("Password salah");
    }

    const others = await this.prisma.user.findMany({
      where: {
        business_id: actor.business_id,
        id: { not: user.id },
        deleted_at: null,
        is_active: true,
        pin_code: { not: null },
      },
      select: { pin_code: true },
    });
    for (const other of others) {
      if (other.pin_code && (await argon2.verify(other.pin_code, dto.pin))) {
        throw new ConflictException("PIN ini sudah dipakai pengguna lain — pilih PIN lain");
      }
    }

    const pin_code = await argon2.hash(dto.pin, { type: argon2.argon2id });
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { pin_code } });
      // Nilai PIN tidak pernah dicatat — hanya fakta bahwa PIN diganti.
      await writeAuditLog(tx, {
        businessId: actor.business_id,
        userId: user.id,
        action: AUDIT_ACTIONS.SET_PIN,
        entityType: "user",
        entityId: user.id,
        ip,
      });
    });
    return { ok: true };
  }
}
