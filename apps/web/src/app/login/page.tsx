"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormError } from "@/components/auth/form-error";
import { PasswordInput } from "@/components/auth/password-input";
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

  const pinMode = mode === "pin" && !!device;

  return (
    <AuthShell
      title={device ? device.name : "Masuk ke BisnisMu"}
      description={pinMode ? "Masukkan PIN kasir Anda" : "Masuk dengan email dan password"}
      footer={
        device ? (
          <>
            Bukan {device.name}?{" "}
            <button type="button" onClick={handleForgetDevice} className="font-medium text-primary hover:underline">
              Ganti usaha
            </button>
          </>
        ) : (
          <>
            Belum punya akun usaha?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Daftar
            </Link>
          </>
        )
      }
    >
      {device && (
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
                mode === value ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {pinMode ? (
        <div className="flex flex-col gap-5">
          <div className="flex justify-center gap-3" aria-label={`${pin.length} digit PIN diisi`} role="status">
            {Array.from({ length: PIN_MAX }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-3 w-3 rounded-full border-2 transition-colors",
                  i < pin.length ? "border-primary bg-primary" : i < 4 ? "border-primary/50" : "border-border",
                )}
              />
            ))}
          </div>
          <FormError message={error} />
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <PinKey key={k} label={k} disabled={loading} onPress={() => pressDigit(k)} />
            ))}
            <PinKey label="Hapus" disabled={loading || pin.length === 0} onPress={() => setPin((p) => p.slice(0, -1))}>
              <Delete className="h-5 w-5" />
            </PinKey>
            <PinKey label="0" disabled={loading} onPress={() => pressDigit("0")} />
            <button
              type="button"
              disabled={loading || pin.length < 4}
              onClick={() => submitPin(pin)}
              className="h-14 rounded-lg bg-primary text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "..." : "Masuk"}
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Belum punya PIN? Minta pemilik mengaturnya di Pengaturan → Pengguna.
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
              autoFocus
              autoComplete="email"
              inputMode="email"
              placeholder="nama@usaha.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
          </div>
          <FormError message={error} />
          <Button type="submit" disabled={loading} className="mt-1 h-11 w-full">
            {loading ? "Memproses..." : "Masuk"}
          </Button>
        </form>
      )}
    </AuthShell>
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
      className="flex h-14 items-center justify-center rounded-lg border border-border bg-card text-xl font-semibold transition-colors hover:bg-muted active:bg-muted disabled:opacity-40"
    >
      {children ?? label}
    </button>
  );
}
