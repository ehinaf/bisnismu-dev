import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { UpdateBusinessDto } from "./update-business.dto";

describe("UpdateBusinessDto.timezone", () => {
  const errorsFor = (timezone: string) => validateSync(plainToInstance(UpdateBusinessDto, { timezone }));

  it.each(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"])("menerima zona IANA %s", (tz) => {
    expect(errorsFor(tz)).toHaveLength(0);
  });

  it.each(["WIB", "GMT+7", "Jakarta"])("menolak %s (bukan zona IANA — akan merusak tanggal struk & laporan)", (tz) => {
    expect(errorsFor(tz)).not.toHaveLength(0);
  });
});
