import { apiClient } from "@/lib/api-client";
import type { Business } from "@/lib/types";

// Perangkat kasir (tablet/HP di toko) mengingat usahanya setelah satu kali login
// email, supaya kasir berikutnya cukup memasukkan PIN. Bukan rahasia: hanya id &
// nama usaha — PIN tetap diverifikasi server dan dikunci setelah 5x salah.
const DEVICE_KEY = "bisnismu-device-business";

export interface DeviceBusiness {
  id: string;
  name: string;
}

export function getDeviceBusiness(): DeviceBusiness | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    return raw ? (JSON.parse(raw) as DeviceBusiness) : null;
  } catch {
    return null;
  }
}

export function forgetDeviceBusiness() {
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    // diabaikan
  }
}

/** Dipanggil setelah login email/daftar berhasil (token sudah tersimpan). */
export async function rememberDeviceBusiness() {
  try {
    const business = await apiClient.get<Business>("/tenant/business");
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ id: business.id, name: business.name }));
  } catch {
    // Tanpa ini login PIN tidak tersedia di perangkat ini — login email tetap jalan.
  }
}
