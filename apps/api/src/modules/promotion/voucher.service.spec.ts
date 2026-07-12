import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { VoucherService } from "./voucher.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("VoucherService", () => {
  let service: VoucherService;
  let prisma: {
    voucher: { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      voucher: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [VoucherService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(VoucherService);
  });

  describe("create", () => {
    it("menolak jika kode voucher sudah dipakai di business ini", async () => {
      prisma.voucher.findUnique.mockResolvedValue({ id: "v-1" });
      await expect(
        service.create("biz-1", { code: "HEMAT10", discount_type: "percentage", value: 10 }),
      ).rejects.toThrow(ConflictException);
    });

    it("menyimpan kode dalam bentuk uppercase-trim", async () => {
      prisma.voucher.findUnique.mockResolvedValue(null);
      prisma.voucher.create.mockResolvedValue({});

      await service.create("biz-1", { code: "  hemat10  ", discount_type: "percentage", value: 10 });

      expect(prisma.voucher.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ business_id: "biz-1", code: "HEMAT10" }),
      });
    });
  });

  describe("update", () => {
    it("menolak jika voucher tidak ditemukan di business", async () => {
      prisma.voucher.findFirst.mockResolvedValue(null);
      await expect(service.update("biz-1", "v-x", { is_active: false })).rejects.toThrow(NotFoundException);
    });

    it("bisa menonaktifkan voucher (is_active=false) sebagai pengganti delete", async () => {
      prisma.voucher.findFirst.mockResolvedValue({ id: "v-1" });
      prisma.voucher.update.mockResolvedValue({});

      await service.update("biz-1", "v-1", { is_active: false });

      expect(prisma.voucher.update).toHaveBeenCalledWith({
        where: { id: "v-1" },
        data: expect.objectContaining({ is_active: false }),
      });
    });
  });
});
