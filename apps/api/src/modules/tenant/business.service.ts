import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UpdateBusinessDto } from "./dto/update-business.dto";
import { UpdateBusinessSettingsDto } from "./dto/update-business-settings.dto";

// Status kunci login PIN — urusan server, tidak dikirim ke browser.
const SETTINGS_INTERNAL = { pin_failed_attempts: true, pin_locked_until: true } as const;

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async getBusiness(business_id: string) {
    const business = await this.prisma.business.findFirst({
      where: { id: business_id, deleted_at: null },
    });
    if (!business) {
      throw new NotFoundException("Business tidak ditemukan");
    }
    return business;
  }

  async updateBusiness(business_id: string, dto: UpdateBusinessDto) {
    await this.getBusiness(business_id);
    return this.prisma.business.update({
      where: { id: business_id },
      data: dto,
    });
  }

  async getSettings(business_id: string) {
    const settings = await this.prisma.businessSetting.findFirst({
      where: { business_id },
      omit: SETTINGS_INTERNAL,
    });
    if (!settings) {
      throw new NotFoundException("Business settings tidak ditemukan");
    }
    return settings;
  }

  async updateSettings(business_id: string, dto: UpdateBusinessSettingsDto) {
    await this.getSettings(business_id);
    if (dto.default_tax_id) {
      const tax = await this.prisma.tax.findFirst({ where: { id: dto.default_tax_id, business_id } });
      if (!tax) throw new NotFoundException("Pajak tidak ditemukan");
    }
    return this.prisma.businessSetting.update({
      where: { business_id },
      data: dto,
      omit: SETTINGS_INTERNAL,
    });
  }
}
