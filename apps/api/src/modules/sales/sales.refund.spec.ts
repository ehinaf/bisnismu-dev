import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { allocateRefund, computeRefund, type RefundableLine, type RefundableTransaction } from "./sales.refund";

const D = (v: number | string) => new Prisma.Decimal(v);

// Struk: 3 × 15.230 + 1 × 10.000 = 55.690; diskon 5% (2.785); PB1 11% atas 52.905 = 5.820; total 58.725.
function transaction(overrides: Partial<RefundableTransaction> = {}): RefundableTransaction {
  return {
    subtotal: D(55690),
    discount_total: D(2785),
    tax_total: D(5820),
    service_charge_total: D(0),
    delivery_fee: D(0),
    total: D(58725),
    refundedTotal: D(0),
    ...overrides,
  };
}

function lines(refundedA = 0, refundedB = 0): RefundableLine[] {
  return [
    { id: "A", quantity: D(3), subtotal: D(45690), refundedQuantity: D(refundedA) },
    { id: "B", quantity: D(1), subtotal: D(10000), refundedQuantity: D(refundedB) },
  ];
}

describe("computeRefund", () => {
  it("refund sebagian: prorata diskon & pajak, komponen menjumlah ke amount", () => {
    const r = computeRefund(transaction(), lines(), [{ lineId: "A", quantity: D(1) }]);

    expect(r.subtotal.toNumber()).toBe(15230);
    // 58.725 × 15.230 / 55.690 = 16.060,14 → 16.060
    expect(r.amount.toNumber()).toBe(16060);
    expect(r.discount.toNumber()).toBe(762); // 2.785 × 0,2735 = 761,6
    expect(r.tax.toNumber()).toBe(1592); // 5.820 × 0,2735 = 1.591,6
    expect(r.subtotal.minus(r.discount).plus(r.tax).plus(r.serviceCharge).plus(r.rounding).toNumber()).toBe(16060);
    expect(r.isFinal).toBe(false);
  });

  it("refund terakhir mengembalikan sisa persis → Σ refund = total", () => {
    const first = computeRefund(transaction(), lines(), [{ lineId: "A", quantity: D(1) }]);
    const second = computeRefund(transaction({ refundedTotal: first.amount }), lines(1, 0), [{ lineId: "A", quantity: D(1) }]);
    const last = computeRefund(
      transaction({ refundedTotal: first.amount.plus(second.amount) }),
      lines(2, 0),
      [
        { lineId: "A", quantity: D(1) },
        { lineId: "B", quantity: D(1) },
      ],
    );

    expect(last.isFinal).toBe(true);
    expect(first.amount.plus(second.amount).plus(last.amount).toNumber()).toBe(58725);
  });

  it("ongkir tidak ikut di refund sebagian, tapi ikut kembali di refund terakhir", () => {
    const withDelivery = transaction({ total: D(68725), delivery_fee: D(10000) });
    const partial = computeRefund(withDelivery, lines(), [{ lineId: "B", quantity: D(1) }]);
    // (68.725 − 10.000) × 10.000 / 55.690 = 10.545,0 → 10.545
    expect(partial.amount.toNumber()).toBe(10545);

    const rest = computeRefund(withDelivery, lines(0, 1), [{ lineId: "A", quantity: D(3) }]);
    expect(rest.isFinal).toBe(true);
    expect(rest.amount.toNumber()).toBe(68725);
  });

  it("tidak pernah mengembalikan lebih dari sisa uang", () => {
    const r = computeRefund(transaction({ refundedTotal: D(58000) }), lines(), [{ lineId: "A", quantity: D(1) }]);
    expect(r.amount.toNumber()).toBe(725);
  });

  it("menolak jumlah melebihi sisa item, item asing, duplikat, dan pilihan kosong", () => {
    expect(() => computeRefund(transaction(), lines(2), [{ lineId: "A", quantity: D(2) }])).toThrow(/melebihi sisa/);
    expect(() => computeRefund(transaction(), lines(), [{ lineId: "X", quantity: D(1) }])).toThrow(BadRequestException);
    expect(() =>
      computeRefund(transaction(), lines(), [
        { lineId: "A", quantity: D(1) },
        { lineId: "A", quantity: D(1) },
      ]),
    ).toThrow(/duplikat/);
    expect(() => computeRefund(transaction(), lines(), [])).toThrow(BadRequestException);
    expect(() => computeRefund(transaction(), lines(), [{ lineId: "A", quantity: D(0) }])).toThrow(BadRequestException);
  });
});

describe("allocateRefund", () => {
  it("mengurangi sisa kasbon dulu, sisanya dibayarkan", () => {
    const r = allocateRefund(D(30000), D(20000));
    expect(r.receivableReduction.toNumber()).toBe(20000);
    expect(r.paidOut.toNumber()).toBe(10000);
  });

  it("tanpa kasbon: semua dibayarkan; kasbon lebih besar: tidak ada uang keluar", () => {
    expect(allocateRefund(D(5000), D(0)).paidOut.toNumber()).toBe(5000);
    const r = allocateRefund(D(5000), D(8000));
    expect(r.receivableReduction.toNumber()).toBe(5000);
    expect(r.paidOut.toNumber()).toBe(0);
  });
});
