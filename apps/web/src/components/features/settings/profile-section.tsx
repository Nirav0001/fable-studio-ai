"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface SettingsUser {
  name: string;
  email: string;
  plan: string;
}

interface ProfileSectionProps {
  user: SettingsUser;
}

export function ProfileSection({ user }: ProfileSectionProps) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name);

  // Keep the draft in sync when a fresh settings payload arrives.
  useEffect(() => {
    setName(user.name);
  }, [user.name]);

  const save = useMutation({
    mutationFn: (nextName: string) =>
      api.patch<{ user: SettingsUser }>("/settings", { name: nextName }),
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err) =>
      toast.error("Could not save profile", {
        description: err instanceof Error ? err.message : undefined,
      }),
  });

  const dirty = name.trim() !== user.name && name.trim().length > 0;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Display name</Label>
          <Input
            id="profile-name"
            value={name}
            maxLength={80}
            placeholder="Your name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty && !save.isPending) save.mutate(name.trim());
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input id="profile-email" value={user.email} readOnly disabled className="opacity-70" />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Plan
          <Badge className="capitalize">{user.plan}</Badge>
        </div>
        <Button
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(name.trim())}
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
