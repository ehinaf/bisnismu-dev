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
    return this.prisma.$transaction(async (tx) => {
      // Kunci baris outlet: dua "buka laci" bersamaan di outlet yang sama tidak
      // boleh sama-sama lolos cek "belum ada laci terbuka" (hasilnya dua sesi open).
      const outlets = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM outlets
        WHERE id = ${dto.outlet_id} AND business_id = ${business_id} AND deleted_at IS NULL
        FOR NO KEY UPDATE
      `;
      if (outlets.length === 0) throw new NotFoundException("Outlet tidak ditemukan");

      const existing = await tx.cashDrawerSession.findFirst({
        where: { outlet_id: dto.outlet_id, status: "open" },
      });
      if (existing) throw new ConflictException("Sudah ada laci yang terbuka di outlet ini");

      return tx.cashDrawerSession.create({
        data: {
          outlet_id: dto.outlet_id,
          opened_by: userId,
          opening_balance: dto.opening_balance ?? 0,
        },
      });
    });
  }

  async close(business_id: string, userId: string, id: string, dto: CloseCashDrawerDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSession(tx, business_id, id);
      const session = await tx.cashDrawerSession.findFirst({
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

      // Penjualan tunai bersih = uang tunai yang diterima − kembalian yang diberikan.
      // payments.amount mencatat uang yang DISERAHKAN pelanggan (mis. 100.000 untuk
      // tagihan 85.000), dan kembalian selalu keluar dari laci — SalesService
      // menolak kembalian dari non-tunai/kasbon.
      const cashTenderedAgg = await tx.payment.aggregate({
        where: {
          is_receivable: false,
          payment_channel: { channel_type: "cash" },
          transaction: { cash_drawer_session_id: id, status: "completed" },
        },
        _sum: { amount: true },
      });
      const changeGivenAgg = await tx.transaction.aggregate({
        where: { cash_drawer_session_id: id, status: "completed" },
        _sum: { change_due: true },
      });
      const cashSales = new Prisma.Decimal(cashTenderedAgg._sum.amount ?? 0).minus(
        new Prisma.Decimal(changeGivenAgg._sum.change_due ?? 0),
      );

      const expectedBalance = new Prisma.Decimal(session.opening_balance).plus(cashIn).minus(cashOut).plus(cashSales);

      return tx.cashDrawerSession.update({
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
    });
  }

  async addMovement(business_id: string, userId: string, sessionId: string, dto: CreateMovementDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSession(tx, business_id, sessionId);
      const session = await tx.cashDrawerSession.findFirst({
        where: { id: sessionId, outlet: { business_id } },
      });
      if (!session) throw new NotFoundException("Sesi laci tidak ditemukan");
      if (session.status !== "open") throw new BadRequestException("Laci sudah ditutup, tidak bisa mencatat kas masuk/keluar");

      return tx.cashDrawerMovement.create({
        data: {
          cash_drawer_session_id: sessionId,
          flow_type: dto.flow_type,
          amount: dto.amount,
          reason: dto.reason,
          created_by: userId,
        },
      });
    });
  }

  /**
   * Kunci sesi laci (FOR NO KEY UPDATE) sampai transaksi commit: tutup laci
   * menunggu penjualan yang sedang berjalan (memegang FOR SHARE atas sesi ini,
   * lihat SalesService.lockOpenDrawerSession) selesai, dan tidak ada tutup ganda
   * atau kas masuk/keluar yang menyusul setelah saldo akhir dihitung.
   */
  private async lockSession(tx: Prisma.TransactionClient, business_id: string, sessionId: string) {
    await tx.$queryRaw`
      SELECT s.id FROM cash_drawer_sessions s
      JOIN outlets o ON o.id = s.outlet_id
      WHERE s.id = ${sessionId} AND o.business_id = ${business_id}
      FOR NO KEY UPDATE OF s
    `;
  }
}
