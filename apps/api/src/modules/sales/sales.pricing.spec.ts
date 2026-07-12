import { Prisma } from "@bisnismu/db";
import { applyRounding } from "./sales.pricing";

describe("applyRounding", () => {
  it("mode none: tidak mengubah total", () => {
    const result = applyRounding(new Prisma.Decimal(12345), "none");
    expect(result.total.toNumber()).toBe(12345);
    expect(result.rounding_adjustment.toNumber()).toBe(0);
  });

  it("mode nearest_100: membulatkan ke ratusan terdekat", () => {
    const result = applyRounding(new Prisma.Decimal(12349), "nearest_100");
    expect(result.total.toNumber()).toBe(12300);
    expect(result.rounding_adjustment.toNumber()).toBe(-49);
  });

  it("mode nearest_100: membulatkan ke atas jika >= 50", () => {
    const result = applyRounding(new Prisma.Decimal(12350), "nearest_100");
    expect(result.total.toNumber()).toBe(12400);
  });

  it("mode up_100: selalu membulatkan ke atas", () => {
    const result = applyRounding(new Prisma.Decimal(12301), "up_100");
    expect(result.total.toNumber()).toBe(12400);
    expect(result.rounding_adjustment.toNumber()).toBe(99);
  });

  it("mode up_100: angka pas kelipatan 100 tidak berubah", () => {
    const result = applyRounding(new Prisma.Decimal(12400), "up_100");
    expect(result.total.toNumber()).toBe(12400);
    expect(result.rounding_adjustment.toNumber()).toBe(0);
  });

  it("mode nearest_500", () => {
    const result = applyRounding(new Prisma.Decimal(12250), "nearest_500");
    expect(result.total.toNumber()).toBe(12500);
  });

  it("mode up_500", () => {
    const result = applyRounding(new Prisma.Decimal(12001), "up_500");
    expect(result.total.toNumber()).toBe(12500);
  });

  it("mode nearest_1000", () => {
    const result = applyRounding(new Prisma.Decimal(12499), "nearest_1000");
    expect(result.total.toNumber()).toBe(12000);
  });
});
