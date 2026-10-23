import { Matches } from "class-validator";

export class SetUserPinDto {
  @Matches(/^\d{4,6}$/, { message: "PIN harus 4–6 digit angka" })
  pin!: string;
}
