"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { clearAuth } from "@/lib/auth";

export function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    clearAuth();
    router.replace("/login");
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout}>
      <LogOut className="h-4 w-4" />
      Keluar
    </Button>
  );
}
