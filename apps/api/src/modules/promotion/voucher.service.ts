import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateVoucherDto } from "./dto/create-voucher.dto";
import { UpdateVoucherDto } from "./dto/update-voucher.dto";

@Injectable()
export class VoucherService {
  constructor(private readonly prisma: PrismaService) {}

  list(business_id: string) {
    return this.prisma.voucher.findMany({ where: { business_id } });
  }

  async getOne(business_id: string, id: string) {
    const voucher = await this.prisma.voucher.findFirst({ where: { id, business_id } });
    if (!voucher) throw new NotFoundException("Voucher tidak ditemukan");
    return voucher;
  }

  async create(business_id: string, dto: CreateVoucherDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.voucher.findUnique({ where: { business_id_code: { business_id, code } } });
    if (existing) throw new ConflictException(`Kode voucher "${code}" sudah dipakai`);

    return this.prisma.voucher.create({
      data: {
        business_id,
        code,
        discount_type: dto.discount_type,
        value: dto.value,
        min_purchase: dto.min_purchase,
        max_discount: dto.max_discount,
        usage_limit: dto.usage_limit,
        per_customer_limit: dto.per_customer_limit,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
        is_active: dto.is_active,
      },
    });
  }

  async update(business_id: string, id: string, dto: UpdateVoucherDto) {
    await this.getOne(business_id, id);
    return this.prisma.voucher.update({
      where: { id },
      data: {
        discount_type: dto.discount_type,
        value: dto.value,
        min_purchase: dto.min_purchase,
        max_discount: dto.max_discount,
        usage_limit: dto.usage_limit,
        per_customer_limit: dto.per_customer_limit,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
        is_active: dto.is_active,
      },
    });
  }

  // Tidak ada delete: `vouchers` tidak punya kolom deleted_at di skema, dan riwayat
  // redemption mereferensikan voucher_id — nonaktifkan via is_active=false alih-alih hapus.
}
