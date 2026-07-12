import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UpdateBusinessDto } from "./dto/update-business.dto";
import { UpdateBusinessSettingsDto } from "./dto/update-business-settings.dto";

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
    });
    if (!settings) {
      throw new NotFoundException("Business settings tidak ditemukan");
    }
    return settings;
  }

  async updateSettings(business_id: string, dto: UpdateBusinessSettingsDto) {
    await this.getSettings(business_id);
    return this.prisma.businessSetting.update({
      where: { business_id },
      data: dto,
    });
  }
}
