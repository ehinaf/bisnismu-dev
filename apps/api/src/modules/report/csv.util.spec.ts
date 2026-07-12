import { toCsv } from "./csv.util";

describe("toCsv", () => {
  it("mengembalikan string kosong untuk array kosong", () => {
    expect(toCsv([])).toBe("");
  });

  it("membuat header dari key baris pertama", () => {
    const csv = toCsv([{ a: 1, b: "x" }]);
    expect(csv).toBe("a,b\n1,x");
  });

  it("membungkus field yang mengandung koma dengan tanda kutip", () => {
    const csv = toCsv([{ name: "Toko A, Cabang 1" }]);
    expect(csv).toBe('name\n"Toko A, Cabang 1"');
  });

  it("meng-escape tanda kutip ganda di dalam field", () => {
    const csv = toCsv([{ note: 'Bilang "halo"' }]);
    expect(csv).toBe('note\n"Bilang ""halo"""');
  });

  it("mengubah null/undefined jadi string kosong", () => {
    const csv = toCsv([{ a: null, b: undefined }]);
    expect(csv).toBe("a,b\n,");
  });
});
