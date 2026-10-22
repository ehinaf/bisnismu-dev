import { parseTrustProxy } from "./trust-proxy";

describe("parseTrustProxy", () => {
  it("kosong / false / 0 → mati", () => {
    expect(parseTrustProxy(undefined)).toBeUndefined();
    expect(parseTrustProxy("")).toBeUndefined();
    expect(parseTrustProxy("false")).toBeUndefined();
    expect(parseTrustProxy("0")).toBeUndefined();
  });

  it("angka → jumlah hop", () => {
    expect(parseTrustProxy("2")).toBe(2);
  });

  it("daftar subnet/kata kunci dirapikan", () => {
    expect(parseTrustProxy(" loopback, linklocal ,uniquelocal ")).toBe("loopback,linklocal,uniquelocal");
  });
});
