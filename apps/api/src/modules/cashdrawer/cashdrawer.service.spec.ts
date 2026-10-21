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
    transaction: { aggregate: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      outlet: { findFirst: jest.fn().mockResolvedValue({ id: "outlet-1", business_id: "biz-1" }) },
      cashDrawerSession: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      cashDrawerMovement: { create: jest.fn() },
      payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
      transaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { change_due: null } }) },
      // Kunci baris (outlet / sesi) — default: baris ditemukan.
      $queryRaw: jest.fn().mockResolvedValue([{ id: "locked-row" }]),
      $transaction: jest.fn(),
    };
    // Interactive transaction: callback dijalankan dengan client yang sama.
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    const moduleRef = await Test.createTestingModule({
      providers: [CashdrawerService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CashdrawerService);
  });

  describe("open", () => {
    it("menolak jika outlet bukan milik business", async () => {
      prisma.$queryRaw.mockResolvedValue([]);
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

    it("mengunci baris outlet sebelum cek laci terbuka (cegah dua sesi open bersamaan)", async () => {
      prisma.cashDrawerSession.findFirst.mockResolvedValue(null);
      prisma.cashDrawerSession.create.mockResolvedValue({ id: "session-1" });

      await service.open("biz-1", "user-1", { outlet_id: "outlet-1" });

      const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
      expect(strings.join("?")).toContain("FROM outlets");
      expect(strings.join("?")).toContain("FOR NO KEY UPDATE");
      expect(values).toEqual(["outlet-1", "biz-1"]);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.cashDrawerSession.findFirst.mock.invocationCallOrder[0],
      );
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

    it("penjualan tunai dihitung bersih: uang diterima − kembalian yang diberikan", async () => {
      mockSession();
      // Mis. 3 transaksi: pelanggan menyerahkan total 300.000 tunai, kembalian total 45.000.
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(300000) } });
      prisma.transaction.aggregate.mockResolvedValue({ _sum: { change_due: new Prisma.Decimal(45000) } });
      prisma.cashDrawerSession.update.mockResolvedValue({});

      await service.close("biz-1", "user-1", "session-1", { closing_balance: 355000 });

      const updateArgs = prisma.cashDrawerSession.update.mock.calls[0][0];
      // 100000 (modal) + 300000 − 45000 = 355000
      expect((updateArgs.data.expected_balance as Prisma.Decimal).toNumber()).toBe(355000);
      // Transaksi yang uangnya nyata di sesi ini: completed + penjualan yang
      // (sebagian) di-refund; refund (payment negatif) ikut mengurangi. Void/open tidak.
      const counted = { in: ["completed", "refunded", "partially_refunded"] };
      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: { cash_drawer_session_id: "session-1", status: counted },
        _sum: { change_due: true },
      });
      expect(prisma.payment.aggregate.mock.calls[0][0].where.transaction).toEqual({
        cash_drawer_session_id: "session-1",
        status: counted,
      });
    });

    it("mengunci sesi (FOR NO KEY UPDATE) sebelum membaca & menghitung saldo", async () => {
      mockSession();
      prisma.cashDrawerSession.update.mockResolvedValue({});

      await service.close("biz-1", "user-1", "session-1", { closing_balance: 100000 });

      const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
      expect(strings.join("?")).toContain("FOR NO KEY UPDATE OF s");
      expect(values).toEqual(["session-1", "biz-1"]);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.cashDrawerSession.findFirst.mock.invocationCallOrder[0],
      );
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
