import { Test } from "@nestjs/testing";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { UserService } from "./user.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";

const owner: JwtPayload = { sub: "owner-1", business_id: "biz-1", role: "owner", email: "owner@x.test" };
const admin: JwtPayload = { sub: "admin-1", business_id: "biz-1", role: "admin", email: "admin@x.test" };
const audit = { userId: "owner-1", ip: "203.0.113.9" };

describe("UserService", () => {
  let service: UserService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      user: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: "new-1", ...data, is_active: true, permissions: [] })),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: "u-1",
          name: data.name ?? "Kasir",
          role: data.role ?? "cashier",
          is_active: data.is_active ?? true,
          email: "kasir@x.test",
          permissions: [{ permission_key: "void_transaction" }],
        })),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: { findFirst: jest.fn() },
      $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [UserService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(UserService);
  });

  describe("create", () => {
    const dto = { name: "Kasir Baru", email: "kasir@x.test", password: "rahasia123", role: "cashier" as const };

    it("membuat kasir di bisnis aktor dengan password ter-hash dan mencatat audit tanpa password", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const result = await service.create(owner, dto, audit);

      const data = tx.user.create.mock.calls[0][0].data;
      expect(data.business_id).toBe("biz-1");
      expect(data.password_hash).not.toBe("rahasia123");
      expect(await argon2.verify(data.password_hash, "rahasia123")).toBe(true);
      expect(result.permissions).toEqual([]);

      const log = tx.auditLog.create.mock.calls[0][0].data;
      expect(log.action).toBe("create_user");
      expect(JSON.stringify(log)).not.toContain("rahasia123");
    });

    it("mengecek email unik lintas bisnis (login tidak memakai business_id)", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "other-biz-user" });
      await expect(service.create(owner, dto, audit)).rejects.toThrow(ConflictException);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { email: "kasir@x.test", deleted_at: null } });
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it("admin tidak boleh membuat admin", async () => {
      await expect(service.create(admin, { ...dto, role: "admin" }, audit)).rejects.toThrow(ForbiddenException);
      expect(tx.user.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("menonaktifkan kasir mencabut semua refresh token dan mencatat audit", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "u-1", name: "Kasir", role: "cashier", is_active: true });
      const result = await service.update(owner, "u-1", { is_active: false }, audit);

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "u-1", business_id: "biz-1", deleted_at: null } }),
      );
      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { user_id: "u-1", revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });
      expect(result.is_active).toBe(false);
      const log = tx.auditLog.create.mock.calls[0][0].data;
      expect(log.old_value).toMatchObject({ is_active: true });
      expect(log.new_value).toMatchObject({ is_active: false, password_reset: false });
    });

    it("reset password menyimpan hash baru, mencabut sesi, dan tidak mencatat password", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "u-1", name: "Kasir", role: "cashier", is_active: true });
      await service.update(owner, "u-1", { password: "baru12345" }, audit);

      const data = tx.user.update.mock.calls[0][0].data;
      expect(await argon2.verify(data.password_hash, "baru12345")).toBe(true);
      expect(tx.refreshToken.updateMany).toHaveBeenCalled();
      const log = tx.auditLog.create.mock.calls[0][0].data;
      expect(log.new_value.password_reset).toBe(true);
      expect(JSON.stringify(log)).not.toContain("baru12345");
    });

    it("ganti nama saja tidak mencabut sesi", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "u-1", name: "Kasir", role: "cashier", is_active: true });
      await service.update(owner, "u-1", { name: "Kasir Pagi" }, audit);
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it("akun pemilik tidak bisa diubah", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "owner-2", name: "Pemilik", role: "owner", is_active: true });
      await expect(service.update(admin, "owner-2", { is_active: false }, audit)).rejects.toThrow(ForbiddenException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it("admin tidak boleh mengubah admin lain atau menaikkan kasir jadi admin", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "admin-2", name: "Admin 2", role: "admin", is_active: true });
      await expect(service.update(admin, "admin-2", { name: "X" }, audit)).rejects.toThrow(ForbiddenException);
      prisma.user.findFirst.mockResolvedValue({ id: "u-1", name: "Kasir", role: "cashier", is_active: true });
      await expect(service.update(admin, "u-1", { role: "admin" }, audit)).rejects.toThrow(ForbiddenException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it("akun sendiri hanya boleh ganti nama", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "admin-1", name: "Admin", role: "admin", is_active: true });
      await expect(service.update(admin, "admin-1", { is_active: false }, audit)).rejects.toThrow(ForbiddenException);
      await expect(service.update(admin, "admin-1", { role: "manager" }, audit)).rejects.toThrow(ForbiddenException);
      await service.update(admin, "admin-1", { name: "Admin Toko" }, audit);
      expect(tx.user.update).toHaveBeenCalledTimes(1);
    });

    it("user bisnis lain → NotFound", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.update(owner, "u-lain", { name: "X" }, audit)).rejects.toThrow(NotFoundException);
    });
  });
});
