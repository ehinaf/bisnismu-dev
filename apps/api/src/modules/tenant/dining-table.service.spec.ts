import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { DiningTableService } from "./dining-table.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("DiningTableService", () => {
  let service: DiningTableService;
  let prisma: {
    outlet: { findFirst: jest.Mock };
    diningTable: { findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      outlet: { findFirst: jest.fn().mockResolvedValue({ id: "outlet-1", business_id: "biz-1" }) },
      diningTable: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [DiningTableService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(DiningTableService);
  });

  it("menolak jika outlet bukan milik business", async () => {
    prisma.outlet.findFirst.mockResolvedValue(null);
    await expect(service.create("biz-1", "outlet-x", { name: "Meja 1" })).rejects.toThrow(NotFoundException);
  });

  it("create() menyisipkan outlet_id dari param", async () => {
    prisma.diningTable.create.mockResolvedValue({});
    await service.create("biz-1", "outlet-1", { name: "Meja 1", capacity: 4 });

    expect(prisma.diningTable.create).toHaveBeenCalledWith({
      data: { name: "Meja 1", capacity: 4, outlet_id: "outlet-1" },
    });
  });

  it("update() bisa mengganti status jadi inactive (mekanisme nonaktifkan meja)", async () => {
    prisma.diningTable.findFirst.mockResolvedValue({ id: "table-1", outlet_id: "outlet-1" });
    prisma.diningTable.update.mockResolvedValue({});

    await service.update("biz-1", "outlet-1", "table-1", { status: "inactive" });

    expect(prisma.diningTable.update).toHaveBeenCalledWith({
      where: { id: "table-1" },
      data: { status: "inactive" },
    });
  });
});
