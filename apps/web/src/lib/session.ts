import { apiClient } from "@/lib/api-client";
import { clearAuth } from "@/lib/auth";

// Cabut sesi di server (refresh token di cookie httpOnly — tidak bisa dihapus
// dari JS) lalu hapus token lokal. Gagal jaringan tidak menahan logout lokal.
export async function logout() {
  try {
    await apiClient.post("/auth/logout", undefined, { auth: false });
  } catch {
    // diabaikan: token lokal tetap dihapus di bawah
  }
  clearAuth();
}
