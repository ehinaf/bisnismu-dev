"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, ApiError } from "@/lib/api-client";
import { saveAuth, type AuthUser } from "@/lib/auth";
import { forgetDeviceBusiness, getDeviceBusiness, rememberDeviceBusiness, type DeviceBusiness } from "@/lib/device";
import { cn } from "@/lib/utils";

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
}

const PIN_MAX = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function LoginPage() {
  const router = useRouter();
  const [device, setDevice] = useState<DeviceBusiness | null>(null);
  const [mode, setMode] = useState<"pin" | "email">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Perangkat yang sudah pernah login email → langsung tawarkan PIN.
  useEffect(() => {
    const known = getDeviceBusiness();
    setDevice(known);
    if (known) setMode("pin");
  }, []);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiClient.post<LoginResponse>("/auth/login", { email, password }, { auth: false });
      saveAuth(result.accessToken, result.user);
      await rememberDeviceBusiness();
      router.replace("/transactions");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal login. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  const submitPin = useCallback(
    async (value: string) => {
      if (!device || value.length < 4) return;
      setError(null);
      setLoading(true);
      try {
        const result = await apiClient.post<LoginResponse>(
          "/auth/login-pin",
          { business_id: device.id, pin_code: value },
          { auth: false },
        );
        saveAuth(result.accessToken, result.user);
        router.replace("/transactions");
      } catch (err) {
        setPin("");
        setError(err instanceof ApiError ? err.message : "Gagal login. Coba lagi.");
      } finally {
        setLoading(false);
      }
    },
    [device, router],
  );

  const pressDigit = useCallback(
    (digit: string) => {
      setError(null);
      setPin((p) => (p.length < PIN_MAX ? p + digit : p));
    },
    [],
  );

  // Keyboard fisik: angka, Backspace, Enter (kasir dengan keyboard/scanner).
  useEffect(() => {
    if (mode !== "pin") return;
    function onKey(e: KeyboardEvent) {
      if (loading) return;
      if (/^\d$/.test(e.key)) pressDigit(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") void submitPin(pin);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, loading, pin, pressDigit, submitPin]);

  function switchMode(next: "pin" | "email") {
    setMode(next);
    setError(null);
    setPin("");
  }

  function handleForgetDevice() {
    forgetDeviceBusiness();
    setDevice(null);
    switchMode("email");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
            B
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {device ? device.name : "Selamat datang kembali"}
            </h1>
            <p className="text-sm text-muted-foreground">Masuk untuk mulai berjualan</p>
          </div>
        </div>
        <Card className="w-full">
          <CardHeader>
            {device ? (
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Cara masuk">
                {(
                  [
                    ["pin", "PIN kasir"],
                    ["email", "Email"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={mode === value}
                    onClick={() => switchMode(value)}
                    className={cn(
                      "h-9 rounded-md text-sm font-medium transition-colors",
                      mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <CardTitle className="text-lg">Masuk ke BisnisMu</CardTitle>
            )}
          </CardHeader>
          <CardContent>
            {mode === "pin" && device ? (
              <div className="flex flex-col gap-4">
                <div className="flex justify-center gap-3" aria-label={`${pin.length} digit PIN diisi`} role="status">
                  {Array.from({ length: PIN_MAX }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-3.5 w-3.5 rounded-full border-2 border-primary transition-colors",
                        i < pin.length ? "bg-primary" : "bg-transparent",
                        i >= 4 && i >= pin.length && "border-border",
                      )}
                    />
                  ))}
                </div>
                {error && <p className="text-center text-sm text-destructive">{error}</p>}
                <div className="grid grid-cols-3 gap-2">
                  {KEYS.map((k) => (
                    <PinKey key={k} label={k} disabled={loading} onPress={() => pressDigit(k)} />
                  ))}
                  <PinKey
                    label="Hapus"
                    disabled={loading || pin.length === 0}
                    onPress={() => setPin((p) => p.slice(0, -1))}
                  >
                    <Delete className="h-5 w-5" />
                  </PinKey>
                  <PinKey label="0" disabled={loading} onPress={() => pressDigit("0")} />
                  <button
                    type="button"
                    disabled={loading || pin.length < 4}
                    onClick={() => submitPin(pin)}
                    className="h-14 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? "..." : "Masuk"}
                  </button>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Belum punya PIN? Minta pemilik mengaturnya di Pengaturan → Pengguna.{" "}
                  <button type="button" onClick={handleForgetDevice} className="underline underline-offset-2">
                    Bukan usaha ini?
                  </button>
                </p>
              </div>
            ) : (
              <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Memproses..." : "Masuk"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Belum punya usaha terdaftar?{" "}
                  <Link href="/register" className="font-medium text-primary underline underline-offset-4">
                    Daftar
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function PinKey({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className="flex h-14 items-center justify-center rounded-xl border border-border bg-card text-xl font-semibold tabular-nums transition-colors hover:bg-accent active:bg-accent disabled:opacity-40"
    >
      {children ?? label}
    </button>
  );
}
