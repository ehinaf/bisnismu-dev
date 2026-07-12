import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { CreateReceivablePaymentDto } from "./dto/create-receivable-payment.dto";

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  list(business_id: string) {
    return this.prisma.customer.findMany({
      where: { business_id, deleted_at: null },
      orderBy: { name: "asc" },
    });
  }

  async getOne(business_id: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, business_id, deleted_at: null } });
    if (!customer) throw new NotFoundException("Pelanggan tidak ditemukan");
    return customer;
  }

  create(business_id: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: { ...dto, business_id } });
  }

  async update(business_id: string, id: string, dto: UpdateCustomerDto) {
    await this.getOne(business_id, id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async softDelete(business_id: string, id: string) {
    await this.getOne(business_id, id);
    return this.prisma.customer.update({ where: { id }, data: { deleted_at: new Date() } });
  }

  async getReceivables(business_id: string, customerId: string) {
    await this.getOne(business_id, customerId);
    return this.prisma.customerReceivable.findMany({
      where: { customer_id: customerId, business_id },
      include: { payments: { orderBy: { paid_at: "asc" } } },
      orderBy: { created_at: "desc" },
    });
  }

  async addReceivablePayment(
    business_id: string,
    customerId: string,
    receivableId: string,
    userId: string,
    dto: CreateReceivablePaymentDto,
  ) {
    await this.getOne(business_id, customerId);

    return this.prisma.$transaction(async (tx) => {
      const receivable = await tx.customerReceivable.findFirst({
        where: { id: receivableId, customer_id: customerId, business_id },
      });
      if (!receivable) throw new NotFoundException("Piutang tidak ditemukan");
      if (receivable.status === "paid" || receivable.status === "written_off") {
        throw new BadRequestException("Piutang ini sudah lunas/ditutup");
      }

      const remaining = new Prisma.Decimal(receivable.amount).minus(receivable.amount_paid);
      const paymentAmount = new Prisma.Decimal(dto.amount);
      if (paymentAmount.greaterThan(remaining)) {
        throw new BadRequestException(
          `Jumlah cicilan (${paymentAmount.toFixed(2)}) melebihi sisa piutang (${remaining.toFixed(2)})`,
        );
      }

      const payment = await tx.receivablePayment.create({
        data: {
          receivable_id: receivableId,
          amount: paymentAmount,
          payment_method: dto.payment_method ?? "cash",
          received_by: userId,
          notes: dto.notes,
        },
      });

      const newAmountPaid = new Prisma.Decimal(receivable.amount_paid).plus(paymentAmount);
      const newStatus = newAmountPaid.greaterThanOrEqualTo(receivable.amount) ? "paid" : "partially_paid";

      await tx.customerReceivable.update({
        where: { id: receivableId },
        data: { amount_paid: newAmountPaid, status: newStatus },
      });

      return payment;
    });
  }
}
