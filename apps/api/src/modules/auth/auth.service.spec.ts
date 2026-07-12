import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";
import { PrismaService } from "../../prisma/prisma.service";

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
    businessSetting: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  const config: Record<string, string> = {
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_ACCESS_EXPIRES_IN: "15m",
    JWT_REFRESH_SECRET: "test-refresh-secret",
    JWT_REFRESH_EXPIRES_IN: "7d",
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      business: { create: jest.fn() },
      businessSetting: { create: jest.fn() },
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
    it("mengeluarkan token jika password cocok", async () => {
      const password_hash = await argon2.hash("password123", { type: argon2.argon2id });
      prisma.user.findFirst.mockResolvedValue({
        id: "user-1",
        business_id: "biz-1",
        email: "owner@example.com",
        password_hash,
        role: "owner",
        is_active: true,
        deleted_at: null,
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.login({ email: "owner@example.com", password: "password123" });

      expect(result.tokens.accessToken).toEqual(expect.any(String));
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it("menolak login jika password salah", async () => {
      const password_hash = await argon2.hash("password123", { type: argon2.argon2id });
      prisma.user.findFirst.mockResolvedValue({
        id: "user-1",
        business_id: "biz-1",
        email: "owner@example.com",
        password_hash,
        role: "owner",
        is_active: true,
        deleted_at: null,
      });

      await expect(service.login({ email: "owner@example.com", password: "wrong" })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("menolak login jika user tidak ditemukan", async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: "nobody@example.com", password: "password123" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("loginPin", () => {
    it("mencocokkan PIN di antara kandidat user pada business yang sama", async () => {
      const pin_code = await argon2.hash("1234", { type: argon2.argon2id });
      prisma.user.findMany.mockResolvedValue([
        { id: "user-1", business_id: "biz-1", pin_code: await argon2.hash("9999", { type: argon2.argon2id }), role: "cashier" },
        { id: "user-2", business_id: "biz-1", pin_code, role: "cashier" },
      ]);
      prisma.user.update.mockResolvedValue({});

      const result = await service.loginPin({ business_id: "biz-1", pin_code: "1234" });

      expect(result.user.id).toBe("user-2");
    });

    it("menolak jika tidak ada PIN yang cocok", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(service.loginPin({ business_id: "biz-1", pin_code: "0000" })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
