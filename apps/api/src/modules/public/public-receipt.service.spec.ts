import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { PublicReceiptService } from "./public-receipt.service";
import type { PrismaService } from "../../prisma/prisma.service";

describe("PublicReceiptService", () => {
  const findUnique = jest.fn();
  const findFirst = jest.fn();
  const service = new PublicReceiptService({ transaction: { findUnique, findFirst } } as unknown as PrismaService);
  const token = "0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    findUnique.mockReset();
    findFirst.mockReset();
  });

  it("token berformat salah → 404 tanpa query DB", async () => {
    await expect(service.getReceipt("../../etc")).rejects.toThrow(NotFoundException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("token tak dikenal & open bill → 404", async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.getReceipt(token)).rejects.toThrow(NotFoundException);
    findUnique.mockResolvedValue({ status: "open" });
    await expect(service.getReceipt(token)).rejects.toThrow(NotFoundException);
  });

  it("hanya memilih kolom struk — tidak ada id, pelanggan, atau kasir", async () => {
    findUnique.mockResolvedValue({
      transaction_number: "INV-1",
      transaction_type: "sale",
      status: "completed",
      created_at: new Date(),
      completed_at: new Date(),
      subtotal: new Prisma.Decimal(10000),
      total: new Prisma.Decimal(10000),
      business: { name: "Warung", settings: null },
      outlet: { name: "Cabang", address: null, phone: null },
      items: [],
      payments: [{ channel_name_snapshot: "Tunai", amount: new Prisma.Decimal(10000), is_receivable: false }],
      reference_transaction: null,
    });

    const receipt = await service.getReceipt(token);

    const select = findUnique.mock.calls[0][0].select;
    for (const hidden of ["id", "customer", "customer_id", "cashier", "cashier_id", "business_id", "notes"]) {
      expect(select).not.toHaveProperty(hidden);
    }
    expect(JSON.stringify(receipt)).not.toMatch(/customer|cashier/);
    expect(receipt.payments).toEqual([{ method: "Tunai", amount: new Prisma.Decimal(10000) }]);
  });

  it("struk cetak di aplikasi: dicari lewat id + business_id, pilihan kolom sama dengan struk publik", async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.getReceiptForBusiness("biz-1", "trx-lain")).rejects.toThrow(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "trx-lain", business_id: "biz-1" }, select: expect.any(Object) });

    await service.getReceipt(token).catch(() => undefined);
    expect(findFirst.mock.calls[0][0].select).toBe(findUnique.mock.calls[0][0].select);
  });
});
