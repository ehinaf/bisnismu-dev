import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { TaxService } from "./tax.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("TaxService", () => {
  let service: TaxService;
  let prisma: { tax: { findMany: jest.Mock }; $transaction: jest.Mock };
  let tx: any;

  beforeEach(async () => {
    tx = {
      tax: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: "tax-new", is_active: true, ...data })),
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: "tax-1",
          name: data.name ?? "PPN",
          rate: data.rate ?? new Prisma.Decimal(11),
          tax_kind: data.tax_kind ?? "tax",
          is_active: data.is_active ?? true,
        })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = { tax: { findMany: jest.fn() }, $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)) };

    const moduleRef = await Test.createTestingModule({
      providers: [TaxService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(TaxService);
  });

  it("hanya mengembalikan pajak aktif milik business ybs", async () => {
    const rows = [{ id: "tax-1", name: "PPN", rate: "11", tax_kind: "tax" }];
    prisma.tax.findMany.mockResolvedValue(rows);

    const result = await service.list("biz-1");

    expect(result).toEqual(rows);
    expect(prisma.tax.findMany).toHaveBeenCalledWith({
      where: { business_id: "biz-1", is_active: true },
      select: { id: true, name: true, rate: true, tax_kind: true, is_active: true },
      orderBy: { name: "asc" },
    });
  });

  it("list(all) untuk Pengaturan ikut menampilkan yang nonaktif", async () => {
    prisma.tax.findMany.mockResolvedValue([]);
    await service.list("biz-1", true);
    expect(prisma.tax.findMany.mock.calls[0][0].where).toEqual({ business_id: "biz-1" });
  });

  it("create() menyimpan tarif sebagai Decimal dan mencatat audit", async () => {
    await service.create("biz-1", { name: "PPN 11%", rate: 11, tax_kind: "tax" }, { userId: "owner-1", ip: null });
    const data = tx.tax.create.mock.calls[0][0].data;
    expect(data.business_id).toBe("biz-1");
    expect(data.rate).toBeInstanceOf(Prisma.Decimal);
    expect(data.rate.toString()).toBe("11");
    const log = tx.auditLog.create.mock.calls[0][0].data;
    expect(log.action).toBe("create_tax");
    expect(log.new_value).toMatchObject({ name: "PPN 11%", rate: "11" });
  });

  it("update() mencatat tarif lama & baru; pajak bisnis lain → NotFound", async () => {
    tx.tax.findFirst.mockResolvedValue({ id: "tax-1", name: "PPN", rate: new Prisma.Decimal(10), tax_kind: "tax", is_active: true });
    await service.update("biz-1", "tax-1", { rate: 11 }, { userId: "owner-1", ip: null });
    expect(tx.tax.findFirst.mock.calls[0][0].where).toEqual({ id: "tax-1", business_id: "biz-1" });
    const log = tx.auditLog.create.mock.calls[0][0].data;
    expect(log.old_value.rate).toBe("10");
    expect(log.new_value.rate).toBe("11");

    tx.tax.findFirst.mockResolvedValue(null);
    await expect(service.update("biz-1", "tax-lain", { is_active: false }, { userId: "owner-1", ip: null })).rejects.toThrow(
      NotFoundException,
    );
  });
});
