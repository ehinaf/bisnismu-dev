import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { CustomerService } from "./customer.service";
import { PrismaService } from "../../prisma/prisma.service";

function buildMockTx(overrides: Record<string, unknown> = {}) {
  const base = {
    customerReceivable: {
      findFirst: jest.fn().mockResolvedValue({
        id: "recv-1",
        customer_id: "cust-1",
        business_id: "biz-1",
        amount: new Prisma.Decimal(100000),
        amount_paid: new Prisma.Decimal(0),
        status: "outstanding",
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    receivablePayment: {
      create: jest.fn().mockResolvedValue({ id: "pay-1" }),
    },
  };
  return { ...base, ...overrides } as any;
}

describe("CustomerService", () => {
  let service: CustomerService;
  let prisma: { customer: { findFirst: jest.Mock }; $transaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: "cust-1", business_id: "biz-1" }) },
      $transaction: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [CustomerService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CustomerService);
  });

  async function runPayment(mockTx: ReturnType<typeof buildMockTx>, amount: number) {
    prisma.$transaction.mockImplementation((fn: any) => fn(mockTx));
    return service.addReceivablePayment("biz-1", "cust-1", "recv-1", "user-1", { amount });
  }

  it("menolak jika pelanggan tidak ditemukan", async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.addReceivablePayment("biz-1", "cust-x", "recv-1", "user-1", { amount: 1000 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("menolak jika piutang tidak ditemukan", async () => {
    const mockTx = buildMockTx({ customerReceivable: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(runPayment(mockTx, 50000)).rejects.toThrow(NotFoundException);
  });

  it("menolak jika piutang sudah lunas", async () => {
    const mockTx = buildMockTx({
      customerReceivable: {
        findFirst: jest.fn().mockResolvedValue({
          id: "recv-1",
          amount: new Prisma.Decimal(100000),
          amount_paid: new Prisma.Decimal(100000),
          status: "paid",
        }),
        update: jest.fn(),
      },
    });
    await expect(runPayment(mockTx, 10000)).rejects.toThrow(BadRequestException);
  });

  it("menolak cicilan yang melebihi sisa piutang", async () => {
    const mockTx = buildMockTx();
    await expect(runPayment(mockTx, 150000)).rejects.toThrow(BadRequestException);
  });

  it("status jadi partially_paid saat cicilan belum menutup seluruh piutang", async () => {
    const mockTx = buildMockTx();
    await runPayment(mockTx, 40000);

    expect(mockTx.customerReceivable.update).toHaveBeenCalledWith({
      where: { id: "recv-1" },
      data: { amount_paid: expect.objectContaining({}), status: "partially_paid" },
    });
    const updateArgs = mockTx.customerReceivable.update.mock.calls[0][0].data;
    expect((updateArgs.amount_paid as Prisma.Decimal).toNumber()).toBe(40000);
  });

  it("status jadi paid saat cicilan menutup seluruh sisa piutang", async () => {
    const mockTx = buildMockTx({
      customerReceivable: {
        findFirst: jest.fn().mockResolvedValue({
          id: "recv-1",
          amount: new Prisma.Decimal(100000),
          amount_paid: new Prisma.Decimal(60000),
          status: "partially_paid",
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    await runPayment(mockTx, 40000);

    const updateArgs = mockTx.customerReceivable.update.mock.calls[0][0].data;
    expect(updateArgs.status).toBe("paid");
    expect((updateArgs.amount_paid as Prisma.Decimal).toNumber()).toBe(100000);
  });
});
