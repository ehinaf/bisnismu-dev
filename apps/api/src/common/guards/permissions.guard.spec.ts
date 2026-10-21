import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";
import { PERMISSIONS } from "../permissions/permissions";
import type { PrismaService } from "../../prisma/prisma.service";

function contextFor(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  const findMany = jest.fn();
  const prisma = { userPermission: { findMany } } as unknown as PrismaService;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector & { getAllAndOverride: jest.Mock };
  const guard = new PermissionsGuard(reflector, prisma);

  beforeEach(() => {
    findMany.mockReset();
    reflector.getAllAndOverride.mockReturnValue(PERMISSIONS.VOID_TRANSACTION);
  });

  it("tanpa @RequirePermission → lolos", async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
  });

  it("owner/manager selalu boleh tanpa membaca user_permissions", async () => {
    await expect(guard.canActivate(contextFor({ sub: "u1", business_id: "b1", role: "manager" }))).resolves.toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("kasir tanpa izin → ditolak", async () => {
    findMany.mockResolvedValue([]);
    await expect(guard.canActivate(contextFor({ sub: "u2", business_id: "b1", role: "cashier" }))).resolves.toBe(false);
  });

  it("kasir dengan izin void_transaction → lolos; izin dibaca per business", async () => {
    findMany.mockResolvedValue([{ permission_key: "void_transaction" }]);
    await expect(guard.canActivate(contextFor({ sub: "u2", business_id: "b1", role: "cashier" }))).resolves.toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: "u2", user: { business_id: "b1" } } }),
    );
  });
});
