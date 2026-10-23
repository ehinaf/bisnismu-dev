"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormError } from "@/components/auth/form-error";
import { PasswordInput } from "@/components/auth/password-input";
import { apiClient, ApiError } from "@/lib/api-client";
import { rememberDeviceBusiness } from "@/lib/device";
import { saveAuth, type AuthUser } from "@/lib/auth";

interface RegisterResponse {
  user: AuthUser;
  accessToken: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    business_name: "",
    owner_name: "",
    owner_email: "",
    owner_password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiClient.post<RegisterResponse>("/auth/register", form, { auth: false });
      saveAuth(result.accessToken, result.user);
      await rememberDeviceBusiness();
      router.replace("/transactions");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mendaftar. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Daftarkan usaha"
      description="Outlet dan metode bayar disiapkan otomatis — siap jualan dalam beberapa menit."
      footer={
        <>
          Sudah punya akun?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Masuk
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="business_name">Nama usaha</Label>
          <Input
            id="business_name"
            required
            autoFocus
            placeholder="mis. Warung Bu Ani"
            value={form.business_name}
            onChange={update("business_name")}
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="owner_name">Nama pemilik</Label>
          <Input
            id="owner_name"
            required
            autoComplete="name"
            value={form.owner_name}
            onChange={update("owner_name")}
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="owner_email">Email</Label>
          <Input
            id="owner_email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="nama@usaha.com"
            value={form.owner_email}
            onChange={update("owner_email")}
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="owner_password">Password</Label>
          <PasswordInput
            id="owner_password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-describedby="owner_password_hint"
            value={form.owner_password}
            onChange={update("owner_password")}
            className="h-11"
          />
          <p id="owner_password_hint" className="text-xs text-muted-foreground">
            Minimal 8 karakter.
          </p>
        </div>
        <FormError message={error} />
        <Button type="submit" disabled={loading} className="mt-1 h-11 w-full">
          {loading ? "Memproses..." : "Daftar"}
        </Button>
      </form>
    </AuthShell>
  );
}
