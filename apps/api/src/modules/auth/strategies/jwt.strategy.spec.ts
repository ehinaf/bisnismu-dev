import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { JwtStrategy } from "./jwt.strategy";
import type { PrismaService } from "../../../prisma/prisma.service";

describe("JwtStrategy.validate", () => {
  const findFirst = jest.fn();
  const strategy = new JwtStrategy(
    { get: () => "secret" } as unknown as ConfigService,
    { user: { findFirst } } as unknown as PrismaService,
  );
  const payload = { sub: "user-1", business_id: "biz-1", role: "owner" as const, email: "a@b.c" };

  beforeEach(() => findFirst.mockReset());

  it("user dinonaktifkan/dihapus → 401 walau token masih berlaku", async () => {
    findFirst.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1", business_id: "biz-1", deleted_at: null, is_active: true } }),
    );
  });

  it("role diambil dari DB, bukan dari token (turun jabatan langsung berlaku)", async () => {
    findFirst.mockResolvedValue({ id: "user-1", business_id: "biz-1", role: "cashier", email: "a@b.c" });
    await expect(strategy.validate(payload)).resolves.toEqual({
      sub: "user-1",
      business_id: "biz-1",
      role: "cashier",
      email: "a@b.c",
    });
  });
});
