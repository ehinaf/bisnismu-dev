import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PrismaService } from "../../prisma/prisma.service";
import { OpenCashDrawerDto } from "./dto/open-cash-drawer.dto";
import { CloseCashDrawerDto } from "./dto/close-cash-drawer.dto";
import { CreateMovementDto } from "./dto/create-movement.dto";

@Injectable()
export class CashdrawerService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOutletInBusiness(business_id: string, outlet_id: string) {
    const outlet = await this.prisma.outlet.findFirst({ where: { id: outlet_id, business_id, deleted_at: null } });
    if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");
    return outlet;
  }

  async getCurrent(business_id: string, outlet_id: string) {
    await this.assertOutletInBusiness(business_id, outlet_id);
    return this.prisma.cashDrawerSession.findFirst({
      where: { outlet_id, status: "open" },
      include: { movements: true },
    });
  }

  async getOne(business_id: string, id: string) {
    const session = await this.prisma.cashDrawerSession.findFirst({
      where: { id, outlet: { business_id } },
      include: { movements: true },
    });
    if (!session) throw new NotFoundException("Sesi laci tidak ditemukan");
    return session;
  }

  history(business_id: string, outlet_id: string) {
    return this.prisma.cashDrawerSession.findMany({
      where: { outlet_id, outlet: { business_id } },
      orderBy: { opened_at: "desc" },
    });
  }

  async open(business_id: string, userId: string, dto: OpenCashDrawerDto) {
    await this.assertOutletInBusiness(business_id, dto.outlet_id);

    const existing = await this.prisma.cashDrawerSession.findFirst({
      where: { outlet_id: dto.outlet_id, status: "open" },
    });
    if (existing) throw new ConflictException("Sudah ada laci yang terbuka di outlet ini");

    return this.prisma.cashDrawerSession.create({
      data: {
        outlet_id: dto.outlet_id,
        opened_by: userId,
        opening_balance: dto.opening_balance ?? 0,
      },
    });
  }

  async close(business_id: string, userId: string, id: string, dto: CloseCashDrawerDto) {
    const session = await this.prisma.cashDrawerSession.findFirst({
      where: { id, outlet: { business_id } },
      include: { movements: true },
    });
    if (!session) throw new NotFoundException("Sesi laci tidak ditemukan");
    if (session.status !== "open") throw new BadRequestException("Sesi laci sudah ditutup");

    const cashIn = session.movements
      .filter((m) => m.flow_type === "cash_in")
      .reduce((sum, m) => sum.plus(m.amount), new Prisma.Decimal(0));
    const cashOut = session.movements
      .filter((m) => m.flow_type === "cash_out")
      .reduce((sum, m) => sum.plus(m.amount), new Prisma.Decimal(0));

    const cashSalesAgg = await this.prisma.payment.aggregate({
      where: {
        is_receivable: false,
        payment_channel: { channel_type: "cash" },
        transaction: { cash_drawer_session_id: id },
      },
      _sum: { amount: true },
    });
    const cashSales = new Prisma.Decimal(cashSalesAgg._sum.amount ?? 0);

    const expectedBalance = new Prisma.Decimal(session.opening_balance).plus(cashIn).minus(cashOut).plus(cashSales);

    return this.prisma.cashDrawerSession.update({
      where: { id },
      data: {
        status: "closed",
        closed_by: userId,
        closed_at: new Date(),
        closing_balance: dto.closing_balance,
        expected_balance: expectedBalance,
        notes: dto.notes,
      },
    });
  }

  async addMovement(business_id: string, userId: string, sessionId: string, dto: CreateMovementDto) {
    const session = await this.prisma.cashDrawerSession.findFirst({
      where: { id: sessionId, outlet: { business_id } },
    });
    if (!session) throw new NotFoundException("Sesi laci tidak ditemukan");
    if (session.status !== "open") throw new BadRequestException("Laci sudah ditutup, tidak bisa mencatat kas masuk/keluar");

    return this.prisma.cashDrawerMovement.create({
      data: {
        cash_drawer_session_id: sessionId,
        flow_type: dto.flow_type,
        amount: dto.amount,
        reason: dto.reason,
        created_by: userId,
      },
    });
  }
}
