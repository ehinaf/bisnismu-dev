import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { OutletService } from "./outlet.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("OutletService", () => {
  let service: OutletService;
  let prisma: {
    outlet: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      outlet: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [OutletService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(OutletService);
  });

  it("list() hanya query outlet milik business_id yang diminta", async () => {
    prisma.outlet.findMany.mockResolvedValue([{ id: "o1", business_id: "biz-1" }]);
    await service.list("biz-1");
    expect(prisma.outlet.findMany).toHaveBeenCalledWith({
      where: { business_id: "biz-1", deleted_at: null },
      orderBy: { created_at: "asc" },
    });
  });

  it("getOne() melempar NotFoundException jika outlet milik business lain", async () => {
    prisma.outlet.findFirst.mockResolvedValue(null);
    await expect(service.getOne("biz-1", "outlet-milik-biz-lain")).rejects.toThrow(NotFoundException);
    expect(prisma.outlet.findFirst).toHaveBeenCalledWith({
      where: { id: "outlet-milik-biz-lain", business_id: "biz-1", deleted_at: null },
    });
  });

  it("create() menyisipkan business_id dari konteks, bukan dari body", async () => {
    prisma.outlet.create.mockResolvedValue({ id: "o1", business_id: "biz-1", name: "Cabang Utama" });
    await service.create("biz-1", { name: "Cabang Utama" });
    expect(prisma.outlet.create).toHaveBeenCalledWith({
      data: { name: "Cabang Utama", business_id: "biz-1" },
    });
  });

  it("softDelete() set deleted_at dan is_active=false, bukan hard delete", async () => {
    prisma.outlet.findFirst.mockResolvedValue({ id: "o1", business_id: "biz-1" });
    prisma.outlet.update.mockResolvedValue({ id: "o1", deleted_at: new Date() });

    await service.softDelete("biz-1", "o1");

    expect(prisma.outlet.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { deleted_at: expect.any(Date), is_active: false },
    });
  });

  it("softDelete() menolak outlet yang tidak ditemukan di business tsb", async () => {
    prisma.outlet.findFirst.mockResolvedValue(null);
    await expect(service.softDelete("biz-1", "o-tidak-ada")).rejects.toThrow(NotFoundException);
    expect(prisma.outlet.update).not.toHaveBeenCalled();
  });
});
