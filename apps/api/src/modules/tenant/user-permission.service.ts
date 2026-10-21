import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, writeAuditLog, type AuditActor } from "../../common/audit/audit-log";
import { UpdateUserPermissionsDto } from "./dto/update-user-permissions.dto";

@Injectable()
export class UserPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertUser(db: Prisma.TransactionClient, business_id: string, user_id: string) {
    const user = await db.user.findFirst({ where: { id: user_id, business_id, deleted_at: null }, select: { id: true } });
    if (!user) throw new NotFoundException("User tidak ditemukan");
  }

  async list(business_id: string, user_id: string) {
    await this.assertUser(this.prisma, business_id, user_id);
    const rows = await this.prisma.userPermission.findMany({ where: { user_id }, select: { permission_key: true } });
    return { user_id, permissions: rows.map((r) => r.permission_key).sort() };
  }

  /** Ganti seluruh daftar izin user (bukan tambah/kurang satu-satu) + catat audit. */
  async replace(business_id: string, user_id: string, dto: UpdateUserPermissionsDto, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertUser(tx, business_id, user_id);
      const before = (await tx.userPermission.findMany({ where: { user_id }, select: { permission_key: true } }))
        .map((r) => r.permission_key)
        .sort();
      const after = [...dto.permissions].sort();

      await tx.userPermission.deleteMany({ where: { user_id } });
      if (after.length > 0) {
        await tx.userPermission.createMany({ data: after.map((permission_key) => ({ user_id, permission_key })) });
      }

      await writeAuditLog(tx, {
        businessId: business_id,
        userId: actor.userId,
        action: AUDIT_ACTIONS.UPDATE_USER_PERMISSIONS,
        entityType: "user",
        entityId: user_id,
        oldValue: { permissions: before },
        newValue: { permissions: after },
        ip: actor.ip,
      });
      return { user_id, permissions: after };
    });
  }
}
