import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class PaymentChannelService {
  constructor(private readonly prisma: PrismaService) {}

  list(business_id: string) {
    return this.prisma.paymentChannel.findMany({
      where: { business_id, is_active: true },
      orderBy: { sort_order: "asc" },
    });
  }
}
