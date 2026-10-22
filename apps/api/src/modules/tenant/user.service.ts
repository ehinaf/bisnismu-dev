import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, writeAuditLog, type AuditActor } from "../../common/audit/audit-log";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { manageableRoles } from "./staff-roles";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  is_active: true,
  permissions: { select: { permission_key: true } },
} as const;

type SelectedUser = { permissions: { permission_key: string }[] } & Record<string, unknown>;

function toBusinessUser<T extends SelectedUser>(u: T) {
  return { ...u, permissions: u.permissions.map((p) => p.permission_key).sort() };
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: JwtPayload, dto: CreateUserDto, audit: AuditActor) {
    if (!manageableRoles(actor.role).includes(dto.role)) {
      throw new ForbiddenException("Anda tidak boleh membuat pengguna dengan peran ini");
    }
    // Login mencari email tanpa business_id, jadi email harus unik lintas bisnis.
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email, deleted_at: null } });
    if (existing) throw new ConflictException("Email sudah terdaftar");

    const password_hash = await argon2.hash(dto.password, { type: argon2.argon2id });
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { business_id: actor.business_id, name: dto.name, email: dto.email, password_hash, role: dto.role },
        select: USER_SELECT,
      });
      await writeAuditLog(tx, {
        businessId: actor.business_id,
        userId: audit.userId,
        action: AUDIT_ACTIONS.CREATE_USER,
        entityType: "user",
        entityId: user.id,
        newValue: { name: user.name, email: user.email, role: user.role },
        ip: audit.ip,
      });
      return toBusinessUser(user);
    });
  }

  async update(actor: JwtPayload, id: string, dto: UpdateUserDto, audit: AuditActor) {
    const target = await this.prisma.user.findFirst({
      where: { id, business_id: actor.business_id, deleted_at: null },
      select: { id: true, name: true, role: true, is_active: true },
    });
    if (!target) throw new NotFoundException("User tidak ditemukan");

    const self = target.id === actor.sub;
    const allowed = manageableRoles(actor.role);
    if (!self && !allowed.includes(target.role)) {
      throw new ForbiddenException("Anda tidak boleh mengubah pengguna ini");
    }
    // Akun sendiri hanya boleh ganti nama — supaya tidak ada yang mengunci diri sendiri.
    if (self && (dto.role !== undefined || dto.is_active !== undefined || dto.password !== undefined)) {
      throw new ForbiddenException("Peran, status, dan password akun sendiri tidak bisa diubah di sini");
    }
    if (dto.role !== undefined && !allowed.includes(dto.role)) {
      throw new ForbiddenException("Anda tidak boleh memberikan peran ini");
    }

    const password_hash = dto.password ? await argon2.hash(dto.password, { type: argon2.argon2id }) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: { name: dto.name, role: dto.role, is_active: dto.is_active, password_hash },
        select: USER_SELECT,
      });
      // Nonaktif / password baru = semua sesi lama berakhir. Access token sudah
      // ditolak JwtStrategy (cek is_active); refresh token dicabut di sini.
      if (dto.is_active === false || password_hash) {
        await tx.refreshToken.updateMany({
          where: { user_id: target.id, revoked_at: null },
          data: { revoked_at: new Date() },
        });
      }
      await writeAuditLog(tx, {
        businessId: actor.business_id,
        userId: audit.userId,
        action: AUDIT_ACTIONS.UPDATE_USER,
        entityType: "user",
        entityId: target.id,
        oldValue: { name: target.name, role: target.role, is_active: target.is_active },
        // Password tidak pernah dicatat — hanya fakta bahwa password direset.
        newValue: { name: user.name, role: user.role, is_active: user.is_active, password_reset: !!password_hash },
        ip: audit.ip,
      });
      return toBusinessUser(user);
    });
  }
}
