import { Test } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { CashdrawerService } from "./cashdrawer.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("CashdrawerService", () => {
  let service: CashdrawerService;
  let prisma: {
    outlet: { findFirst: jest.Mock };
    cashDrawerSession: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    cashDrawerMovement: { create: jest.Mock };
    payment: { aggregate: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      outlet: { findFirst: jest.fn().mockResolvedValue({ id: "outlet-1", business_id: "biz-1" }) },
      cashDrawerSession: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      cashDrawerMovement: { create: jest.fn() },
      payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [CashdrawerService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CashdrawerService);
  });

  describe("open", () => {
    it("menolak jika outlet bukan milik business", async () => {
      prisma.outlet.findFirst.mockResolvedValue(null);
      await expect(service.open("biz-1", "user-1", { outlet_id: "outlet-x" })).rejects.toThrow(NotFoundException);
    });

    it("menolak jika sudah ada laci terbuka di outlet itu", async () => {
      prisma.cashDrawerSession.findFirst.mockResolvedValue({ id: "session-existing", status: "open" });
      await expect(service.open("biz-1", "user-1", { outlet_id: "outlet-1", opening_balance: 100000 })).rejects.toThrow(
        ConflictException,
      );
    });

    it("membuka laci baru dengan opening_balance yang benar", async () => {
      prisma.cashDrawerSession.findFirst.mockResolvedValue(null);
      prisma.cashDrawerSession.create.mockResolvedValue({ id: "session-1" });

      await service.open("biz-1", "user-1", { outlet_id: "outlet-1", opening_balance: 200000 });

      expect(prisma.cashDrawerSession.create).toHaveBeenCalledWith({
        data: { outlet_id: "outlet-1", opened_by: "user-1", opening_balance: 200000 },
      });
    });
  });

  describe("close", () => {
    function mockSession(overrides: Partial<{ status: string; movements: unknown[] }> = {}) {
      prisma.cashDrawerSession.findFirst.mockResolvedValue({
        id: "session-1",
        opening_balance: new Prisma.Decimal(100000),
        status: "open",
        movements: [],
        ...overrides,
      });
    }

    it("menolak jika sesi tidak ditemukan", async () => {
      prisma.cashDrawerSession.findFirst.mockResolvedValue(null);
      await expect(service.close("biz-1", "user-1", "session-x", { closing_balance: 100000 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("menolak jika sesi sudah ditutup", async () => {
      mockSession({ status: "closed" });
      await expect(service.close("biz-1", "user-1", "session-1", { closing_balance: 100000 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("menghitung expected_balance = opening + cash_in - cash_out + penjualan tunai", async () => {
      mockSession({
        movements: [
          { flow_type: "cash_in", amount: new Prisma.Decimal(50000) },
          { flow_type: "cash_out", amount: new Prisma.Decimal(20000) },
        ],
      });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(75000) } });
      prisma.cashDrawerSession.update.mockResolvedValue({});

      await service.close("biz-1", "user-1", "session-1", { closing_balance: 205000 });

      const updateArgs = prisma.cashDrawerSession.update.mock.calls[0][0];
      // 100000 + 50000 - 20000 + 75000 = 205000
      expect((updateArgs.data.expected_balance as Prisma.Decimal).toNumber()).toBe(205000);
      expect(updateArgs.data.status).toBe("closed");
    });
  });

  describe("addMovement", () => {
    it("menolak mencatat kas masuk/keluar jika laci sudah tertutup", async () => {
      prisma.cashDrawerSession.findFirst.mockResolvedValue({ id: "session-1", status: "closed" });
      await expect(
        service.addMovement("biz-1", "user-1", "session-1", { flow_type: "cash_in", amount: 10000, reason: "Setor modal" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("mencatat movement jika laci masih terbuka", async () => {
      prisma.cashDrawerSession.findFirst.mockResolvedValue({ id: "session-1", status: "open" });
      prisma.cashDrawerMovement.create.mockResolvedValue({ id: "mv-1" });

      await service.addMovement("biz-1", "user-1", "session-1", {
        flow_type: "cash_out",
        amount: 15000,
        reason: "Beli galon",
      });

      expect(prisma.cashDrawerMovement.create).toHaveBeenCalledWith({
        data: {
          cash_drawer_session_id: "session-1",
          flow_type: "cash_out",
          amount: 15000,
          reason: "Beli galon",
          created_by: "user-1",
        },
      });
    });
  });
});
