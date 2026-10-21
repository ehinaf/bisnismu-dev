import {
  DEFAULT_TIMEZONE,
  dateOnly,
  isValidTimeZone,
  nextDate,
  resolveTimeZone,
  zonedDayStart,
  zonedParts,
} from "./business-time";

describe("business-time", () => {
  describe("zonedParts", () => {
    it("memakai jam dinding zona usaha, bukan jam server/UTC", () => {
      // 20 Okt 18:30 UTC = Rabu 21 Okt 01:30 WIB
      const parts = zonedParts(new Date("2026-10-20T18:30:00Z"), "Asia/Jakarta");
      expect(parts).toEqual({ date: "2026-10-21", hm: "01:30", dayOfWeek: 3 });
    });

    it("membedakan WIB / WITA / WIT", () => {
      const instant = new Date("2026-10-20T16:30:00Z");
      expect(zonedParts(instant, "Asia/Jakarta").date).toBe("2026-10-20"); // 23:30 WIB
      expect(zonedParts(instant, "Asia/Makassar").date).toBe("2026-10-21"); // 00:30 WITA
      expect(zonedParts(instant, "Asia/Jayapura").hm).toBe("01:30"); // 01:30 WIT
    });

    it("tengah malam ditulis 00, bukan 24", () => {
      expect(zonedParts(new Date("2026-10-20T17:00:00Z"), "Asia/Jakarta").hm).toBe("00:00");
    });
  });

  describe("zonedDayStart", () => {
    it("awal hari WIB = 17:00 UTC hari sebelumnya", () => {
      expect(zonedDayStart("2026-10-21", "Asia/Jakarta").toISOString()).toBe("2026-10-20T17:00:00.000Z");
    });

    it("awal hari WITA = 16:00 UTC hari sebelumnya", () => {
      expect(zonedDayStart("2026-10-21", "Asia/Makassar").toISOString()).toBe("2026-10-20T16:00:00.000Z");
    });

    it("tetap benar di zona ber-DST", () => {
      // 8 Mar 2026 — hari pergantian DST di New York (EST -05:00 di tengah malam)
      expect(zonedDayStart("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    });
  });

  describe("resolveTimeZone", () => {
    it("zona tidak valid / kosong jatuh ke default (tidak melempar)", () => {
      expect(isValidTimeZone("WIB")).toBe(false);
      expect(resolveTimeZone("WIB")).toBe(DEFAULT_TIMEZONE);
      expect(resolveTimeZone(null)).toBe(DEFAULT_TIMEZONE);
      expect(resolveTimeZone("Asia/Makassar")).toBe("Asia/Makassar");
    });
  });

  it("dateOnly & nextDate: aritmetika tanggal kalender", () => {
    expect(dateOnly("2026-10-21").toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(nextDate("2026-10-31")).toBe("2026-11-01");
    expect(nextDate("2028-02-28")).toBe("2028-02-29");
  });
});
