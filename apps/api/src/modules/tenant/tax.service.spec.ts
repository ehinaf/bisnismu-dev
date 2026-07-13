import { Test } from "@nestjs/testing";
import { TaxService } from "./tax.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("TaxService", () => {
  let service: TaxService;
  let prisma: { tax: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { tax: { findMany: jest.fn() } };

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
      select: { id: true, name: true, rate: true, tax_kind: true },
      orderBy: { name: "asc" },
    });
  });
});
