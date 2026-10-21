import { createHash } from "node:crypto";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ConflictException, HttpException, HttpStatus, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService, PIN_LOCK_MS, PIN_MAX_ATTEMPTS, REFRESH_ROTATION_GRACE_MS } from "./auth.service";
import { PrismaService } from "../../prisma/prisma.service";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    business: { create: jest.Mock };
    businessSetting: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    refreshToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
    userPermission: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const config: Record<string, string> = {
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_ACCESS_EXPIRES_IN: "15m",
  };

  const activeUser = {
    id: "user-1",
    business_id: "biz-1",
    name: "Kasir",
    email: "kasir@example.com",
    role: "cashier",
    is_active: true,
    deleted_at: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
      },
      business: { create: jest.fn() },
      businessSetting: { create: jest.fn(), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userPermission: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: new JwtService() },
        { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe("registerBusiness", () => {
    it("membuat business + owner user dan mengembalikan token", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const createdUser = {
        id: "user-1",
        business_id: "biz-1",
        name: "Owner",
        email: "owner@example.com",
        phone: null,
        password_hash: "hashed",
        role: "owner",
        pin_code: null,
        is_active: true,
        last_login_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };
      prisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          business: { create: jest.fn().mockResolvedValue({ id: "biz-1" }) },
          businessSetting: { create: jest.fn().mockResolvedValue({}) },
          user: { create: jest.fn().mockResolvedValue(createdUser) },
        }),
      );

      const result = await service.registerBusiness({
        business_name: "Toko Maju",
        owner_name: "Owner",
        owner_email: "owner@example.com",
        owner_password: "password123",
      });

      expect(result.user.email).toBe("owner@example.com");
      expect((result.user as any).password_hash).toBeUndefined();
      expect(result.tokens.accessToken).toEqual(expect.any(String));
      expect(result.tokens.refreshToken).toEqual(expect.any(String));
    });

    it("menolak registrasi jika email sudah dipakai", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "existing" });

      await expect(
        service.registerBusiness({
          business_name: "Toko Maju",
          owner_name: "Owner",
          owner_email: "owner@example.com",
          owner_password: "password123",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("login", () => {
    it("mengeluarkan token; refresh token opaque disimpan sebagai hash, bukan teks aslinya", async () => {
      const password_hash = await argon2.hash("password123", { type: argon2.argon2id });
      prisma.user.findFirst.mockResolvedValue({ ...activeUser, role: "owner", password_hash });

      const result = await service.login({ email: "kasir@example.com", password: "password123" });

      expect(result.tokens.accessToken).toEqual(expect.any(String));
      expect(prisma.user.update).toHaveBeenCalled();
      const stored = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(stored.token_hash).toBe(sha256(result.tokens.refreshToken));
      expect(stored.token_hash).not.toBe(result.tokens.refreshToken);
      expect(stored.family_id).toEqual(expect.any(String));
    });

    it("menolak login jika password salah", async () => {
      const password_hash = await argon2.hash("password123", { type: argon2.argon2id });
      prisma.user.findFirst.mockResolvedValue({ ...activeUser, password_hash });

      await expect(service.login({ email: "kasir@example.com", password: "wrong" })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("menolak login jika user tidak ditemukan", async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.login({ email: "nobody@example.com", password: "password123" })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("loginPin", () => {
    it("mencocokkan PIN di antara kandidat user pada business yang sama", async () => {
      const pin_code = await argon2.hash("1234", { type: argon2.argon2id });
      prisma.user.findMany.mockResolvedValue([
        { id: "user-1", business_id: "biz-1", pin_code: await argon2.hash("9999", { type: argon2.argon2id }), role: "cashier" },
        { id: "user-2", business_id: "biz-1", pin_code, role: "cashier" },
      ]);

      const result = await service.loginPin({ business_id: "biz-1", pin_code: "1234" });

      expect(result.user.id).toBe("user-2");
    });

    it("menolak jika tidak ada PIN yang cocok", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(service.loginPin({ business_id: "biz-1", pin_code: "0000" })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("PIN salah menambah hitungan gagal secara atomik (increment di DB)", async () => {
      prisma.businessSetting.findUnique.mockResolvedValue({ business_id: "biz-1", pin_failed_attempts: 1, pin_locked_until: null });
      prisma.businessSetting.update.mockResolvedValue({ pin_failed_attempts: 2 });
      prisma.user.findMany.mockResolvedValue([]);

      await expect(service.loginPin({ business_id: "biz-1", pin_code: "0000" })).rejects.toThrow(UnauthorizedException);
      expect(prisma.businessSetting.update).toHaveBeenCalledTimes(1);
      expect(prisma.businessSetting.update).toHaveBeenCalledWith({
        where: { business_id: "biz-1" },
        data: { pin_failed_attempts: { increment: 1 } },
      });
    });

    it(`kegagalan ke-${PIN_MAX_ATTEMPTS} mengunci login PIN bisnis selama ${PIN_LOCK_MS / 60_000} menit`, async () => {
      prisma.businessSetting.findUnique.mockResolvedValue({ business_id: "biz-1", pin_failed_attempts: 4, pin_locked_until: null });
      prisma.businessSetting.update.mockResolvedValueOnce({ pin_failed_attempts: PIN_MAX_ATTEMPTS }).mockResolvedValueOnce({});
      prisma.user.findMany.mockResolvedValue([]);
      const before = Date.now();

      await expect(service.loginPin({ business_id: "biz-1", pin_code: "0000" })).rejects.toThrow(UnauthorizedException);

      const lockCall = prisma.businessSetting.update.mock.calls[1][0];
      expect(lockCall.data.pin_failed_attempts).toBe(0);
      expect(lockCall.data.pin_locked_until.getTime()).toBeGreaterThanOrEqual(before + PIN_LOCK_MS);
    });

    it("saat terkunci: 429 tanpa memeriksa PIN sama sekali (PIN benar pun ditolak)", async () => {
      prisma.businessSetting.findUnique.mockResolvedValue({
        business_id: "biz-1",
        pin_failed_attempts: 0,
        pin_locked_until: new Date(Date.now() + 3 * 60_000),
      });

      const error = await service.loginPin({ business_id: "biz-1", pin_code: "1234" }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it("login PIN berhasil mereset hitungan gagal", async () => {
      prisma.businessSetting.findUnique.mockResolvedValue({ business_id: "biz-1", pin_failed_attempts: 3, pin_locked_until: null });
      prisma.user.findMany.mockResolvedValue([
        { ...activeUser, pin_code: await argon2.hash("1234", { type: argon2.argon2id }) },
      ]);

      await service.loginPin({ business_id: "biz-1", pin_code: "1234" });

      expect(prisma.businessSetting.update).toHaveBeenCalledWith({
        where: { business_id: "biz-1" },
        data: { pin_failed_attempts: 0, pin_locked_until: null },
      });
    });
  });

  describe("refresh (rotasi)", () => {
    const record = (overrides: Record<string, unknown> = {}) => ({
      id: "rt-1",
      user_id: "user-1",
      family_id: "fam-1",
      token_hash: sha256("old-token"),
      expires_at: new Date(Date.now() + 60_000),
      replaced_at: null,
      revoked_at: null,
      user: activeUser,
      ...overrides,
    });

    it("token valid → token baru di family yang sama, token lama ditandai replaced", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(record());

      const tokens = await service.refresh("old-token");

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token_hash: sha256("old-token") } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: "rt-1", replaced_at: null },
        data: { replaced_at: expect.any(Date) },
      });
      expect(prisma.refreshToken.create.mock.calls[0][0].data.family_id).toBe("fam-1");
      expect(tokens.refreshToken).not.toBe("old-token");
    });

    it("dipakai lagi dalam masa tenggang (refresh paralel) → tetap dilayani, family tidak dicabut", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(record({ replaced_at: new Date(Date.now() - 5_000) }));

      await expect(service.refresh("old-token")).resolves.toEqual(
        expect.objectContaining({ refreshToken: expect.any(String) }),
      );
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { revoked_at: expect.any(Date) } }),
      );
    });

    it("dipakai lagi setelah masa tenggang → seluruh family dicabut (indikasi token dicuri)", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        record({ replaced_at: new Date(Date.now() - REFRESH_ROTATION_GRACE_MS - 1_000) }),
      );

      await expect(service.refresh("old-token")).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { family_id: "fam-1", revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it("token yang sudah dicabut (mis. setelah logout) → 401", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(record({ revoked_at: new Date() }));
      await expect(service.refresh("old-token")).rejects.toThrow(UnauthorizedException);
    });

    it("token tak dikenal / kedaluwarsa → 401", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh("x")).rejects.toThrow(UnauthorizedException);
      prisma.refreshToken.findUnique.mockResolvedValue(record({ expires_at: new Date(Date.now() - 1) }));
      await expect(service.refresh("old-token")).rejects.toThrow(UnauthorizedException);
    });

    it("user sudah dinonaktifkan → 401 dan family dicabut", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(record({ user: { ...activeUser, is_active: false } }));
      await expect(service.refresh("old-token")).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { family_id: "fam-1", revoked_at: null } }));
    });
  });

  describe("logout", () => {
    it("mencabut seluruh family milik token", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ id: "rt-1", family_id: "fam-9" });
      await service.logout("some-token");
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { family_id: "fam-9", revoked_at: null },
        data: { revoked_at: expect.any(Date) },
      });
    });

    it("tanpa cookie / token tak dikenal → tidak melakukan apa-apa", async () => {
      await service.logout(undefined);
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await service.logout("unknown");
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("setPin", () => {
    const actor = { sub: "user-1", business_id: "biz-1", role: "cashier" as const, email: null };

    beforeEach(async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        password_hash: await argon2.hash("password123", { type: argon2.argon2id }),
      });
    });

    it("menolak bila password konfirmasi salah", async () => {
      await expect(service.setPin(actor, { current_password: "salah", pin: "4321" })).rejects.toThrow(UnauthorizedException);
    });

    it("menolak PIN yang sudah dipakai user aktif lain di bisnis yang sama", async () => {
      prisma.user.findMany.mockResolvedValue([{ pin_code: await argon2.hash("4321", { type: argon2.argon2id }) }]);
      await expect(service.setPin(actor, { current_password: "password123", pin: "4321" })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ business_id: "biz-1", id: { not: "user-1" } }) }),
      );
    });

    it("menyimpan hash PIN + audit set_pin tanpa nilai PIN", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      const tx = { user: { update: jest.fn().mockResolvedValue({}) }, auditLog: { create: jest.fn().mockResolvedValue({}) } };
      prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));

      await service.setPin(actor, { current_password: "password123", pin: "4321" }, "127.0.0.1");

      const savedHash = tx.user.update.mock.calls[0][0].data.pin_code;
      expect(await argon2.verify(savedHash, "4321")).toBe(true);
      const audit = tx.auditLog.create.mock.calls[0][0].data;
      expect(audit.action).toBe("set_pin");
      expect(JSON.stringify(audit)).not.toContain("4321");
    });
  });

  describe("me", () => {
    it("owner/admin/manager mendapat semua izin; kasir hanya izin miliknya", async () => {
      await expect(service.me({ sub: "u", business_id: "b", role: "owner", email: null })).resolves.toEqual(
        expect.objectContaining({ permissions: ["void_transaction", "refund_transaction"] }),
      );
      prisma.userPermission.findMany.mockResolvedValue([]);
      await expect(service.me({ sub: "u", business_id: "b", role: "cashier", email: null })).resolves.toEqual(
        expect.objectContaining({ permissions: [] }),
      );
    });
  });
});
