"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function DangerZone() {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api.post<Record<string, never>>("/auth/logout");
    } catch (err) {
      // Even if the API call fails, drop the local session by leaving anyway.
      toast.error("Logout request failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
    window.location.href = "/login";
  }

  return (
    <div className="glass rounded-2xl border border-red-500/25 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-red-300">Sign out</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ends your session on this device. Scheduled uploads and automation keep running.
          </p>
        </div>
        <Button variant="destructive" size="sm" disabled={signingOut} onClick={() => void signOut()}>
          <LogOut className="mr-1.5 h-3.5 w-3.5" />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </div>
  );
}
