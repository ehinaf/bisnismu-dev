import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { BusinessService } from "./business.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("BusinessService", () => {
  let service: BusinessService;
  let prisma: {
    business: { findFirst: jest.Mock; update: jest.Mock };
    businessSetting: { findFirst: jest.Mock; update: jest.Mock };
    tax: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      business: { findFirst: jest.fn(), update: jest.fn() },
      businessSetting: { findFirst: jest.fn(), update: jest.fn() },
      tax: { findFirst: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [BusinessService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(BusinessService);
  });

  describe("getBusiness", () => {
    it("mengembalikan business jika ditemukan", async () => {
      prisma.business.findFirst.mockResolvedValue({ id: "biz-1", name: "Toko A" });
      const result = await service.getBusiness("biz-1");
      expect(result).toEqual({ id: "biz-1", name: "Toko A" });
      expect(prisma.business.findFirst).toHaveBeenCalledWith({
        where: { id: "biz-1", deleted_at: null },
      });
    });

    it("melempar NotFoundException jika business tidak ada", async () => {
      prisma.business.findFirst.mockResolvedValue(null);
      await expect(service.getBusiness("biz-x")).rejects.toThrow(NotFoundException);
    });
  });

  describe("updateBusiness", () => {
    it("hanya mengupdate business milik business_id yang benar", async () => {
      prisma.business.findFirst.mockResolvedValue({ id: "biz-1" });
      prisma.business.update.mockResolvedValue({ id: "biz-1", name: "Baru" });

      const result = await service.updateBusiness("biz-1", { name: "Baru" });

      expect(prisma.business.update).toHaveBeenCalledWith({
        where: { id: "biz-1" },
        data: { name: "Baru" },
      });
      expect(result.name).toBe("Baru");
    });
  });

  describe("getSettings / updateSettings", () => {
    it("melempar NotFoundException jika settings belum ada", async () => {
      prisma.businessSetting.findFirst.mockResolvedValue(null);
      await expect(service.getSettings("biz-1")).rejects.toThrow(NotFoundException);
    });

    it("mengupdate feature flags", async () => {
      prisma.businessSetting.findFirst.mockResolvedValue({ business_id: "biz-1" });
      prisma.businessSetting.update.mockResolvedValue({ business_id: "biz-1", enable_kasbon: true });

      const result = await service.updateSettings("biz-1", { enable_kasbon: true });

      expect(prisma.businessSetting.update).toHaveBeenCalledWith({
        where: { business_id: "biz-1" },
        data: { enable_kasbon: true },
        omit: { pin_failed_attempts: true, pin_locked_until: true },
      });
      expect(result.enable_kasbon).toBe(true);
    });

    it("status kunci PIN tidak dikirim ke browser", async () => {
      prisma.businessSetting.findFirst.mockResolvedValue({ business_id: "biz-1" });
      await service.getSettings("biz-1");
      expect(prisma.businessSetting.findFirst.mock.calls[0][0].omit).toEqual({
        pin_failed_attempts: true,
        pin_locked_until: true,
      });
    });

    it("default_tax_id milik bisnis lain ditolak", async () => {
      prisma.businessSetting.findFirst.mockResolvedValue({ business_id: "biz-1" });
      prisma.tax.findFirst.mockResolvedValue(null);
      await expect(service.updateSettings("biz-1", { default_tax_id: "tax-lain" })).rejects.toThrow(NotFoundException);
      expect(prisma.tax.findFirst).toHaveBeenCalledWith({ where: { id: "tax-lain", business_id: "biz-1" } });
      expect(prisma.businessSetting.update).not.toHaveBeenCalled();
    });
  });
});
