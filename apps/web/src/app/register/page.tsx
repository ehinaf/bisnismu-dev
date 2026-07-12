"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, ApiError } from "@/lib/api-client";
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
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mendaftar. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Daftarkan Usaha</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="business_name">Nama Usaha</Label>
              <Input id="business_name" required value={form.business_name} onChange={update("business_name")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="owner_name">Nama Pemilik</Label>
              <Input id="owner_name" required value={form.owner_name} onChange={update("owner_name")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="owner_email">Email</Label>
              <Input
                id="owner_email"
                type="email"
                required
                autoComplete="email"
                value={form.owner_email}
                onChange={update("owner_email")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="owner_password">Password</Label>
              <Input
                id="owner_password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={form.owner_password}
                onChange={update("owner_password")}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Memproses..." : "Daftar"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Sudah punya akun?{" "}
              <Link href="/login" className="font-medium text-primary underline underline-offset-4">
                Masuk
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
