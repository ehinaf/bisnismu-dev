import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PaymentChannelService } from "./payment-channel.service";
import { PrismaService } from "../../prisma/prisma.service";

const actor = { userId: "owner-1", ip: "203.0.113.9" };
const qris = {
  id: "ch-qris",
  business_id: "biz-1",
  name: "QRIS",
  channel_type: "qris",
  fee_percentage: new Prisma.Decimal(0),
  fee_fixed: new Prisma.Decimal(0),
  is_active: true,
  sort_order: 2,
};

describe("PaymentChannelService", () => {
  let service: PaymentChannelService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      paymentChannel: {
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({ id: "ch-new", is_active: true, ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...qris,
          ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
        })),
        count: jest.fn().mockResolvedValue(1),
        aggregate: jest.fn().mockResolvedValue({ _max: { sort_order: 3 } }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      paymentChannel: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [PaymentChannelService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PaymentChannelService);
  });

  it("list() untuk kasir hanya yang aktif; Pengaturan bisa minta semua", async () => {
    await service.list("biz-1");
    expect(prisma.paymentChannel.findMany.mock.calls[0][0].where).toEqual({ business_id: "biz-1", is_active: true });
    await service.list("biz-1", true);
    expect(prisma.paymentChannel.findMany.mock.calls[1][0].where).toEqual({ business_id: "biz-1" });
  });

  it("create() menyimpan biaya sebagai Decimal (bukan float) dan urutan di paling bawah", async () => {
    await service.create("biz-1", { name: "GoPay", channel_type: "e_wallet", fee_percentage: 0.7, fee_fixed: 500 }, actor);
    const data = tx.paymentChannel.create.mock.calls[0][0].data;
    expect(data.business_id).toBe("biz-1");
    expect(data.fee_percentage).toBeInstanceOf(Prisma.Decimal);
    expect(data.fee_percentage.toString()).toBe("0.7");
    expect(data.fee_fixed.toString()).toBe("500");
    expect(data.sort_order).toBe(4);
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe("create_payment_channel");
  });

  it("update() mencatat perubahan biaya MDR di audit", async () => {
    tx.paymentChannel.findFirst.mockResolvedValue(qris);
    await service.update("biz-1", "ch-qris", { fee_percentage: 0.3 }, actor);

    expect(tx.paymentChannel.findFirst).toHaveBeenCalledWith({ where: { id: "ch-qris", business_id: "biz-1" } });
    const log = tx.auditLog.create.mock.calls[0][0].data;
    expect(log.action).toBe("update_payment_channel");
    expect(log.old_value.fee_percentage).toBe("0");
    expect(log.new_value.fee_percentage).toBe("0.3");
  });

  it("update() tanpa perubahan nyata tidak menulis audit", async () => {
    tx.paymentChannel.findFirst.mockResolvedValue(qris);
    await service.update("biz-1", "ch-qris", { name: "QRIS" }, actor);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("update() menolak bila tidak tersisa metode Tunai aktif (transaksi di-rollback)", async () => {
    tx.paymentChannel.findFirst.mockResolvedValue({ ...qris, id: "ch-cash", name: "Tunai", channel_type: "cash" });
    tx.paymentChannel.count.mockResolvedValue(0);
    await expect(service.update("biz-1", "ch-cash", { is_active: false }, actor)).rejects.toThrow(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.paymentChannel.count).toHaveBeenCalledWith({
      where: { business_id: "biz-1", is_active: true, channel_type: "cash" },
    });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("update() channel milik bisnis lain → NotFound", async () => {
    tx.paymentChannel.findFirst.mockResolvedValue(null);
    await expect(service.update("biz-1", "ch-lain", { name: "X" }, actor)).rejects.toThrow(NotFoundException);
    expect(tx.paymentChannel.update).not.toHaveBeenCalled();
  });
});
