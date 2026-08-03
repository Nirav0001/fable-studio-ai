"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Copy, KeyRound, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ApiKeyT {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CreatedKey {
  id: string;
  name: string;
  prefix: string;
  key: string;
  createdAt: string;
}

interface ApiKeysSectionProps {
  apiKeys: ApiKeyT[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "d MMM yyyy");
}

export function ApiKeysSection({ apiKeys }: ApiKeysSectionProps) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyT | null>(null);

  const create = useMutation({
    mutationFn: (name: string) => api.post<CreatedKey>("/settings/api-keys", { name }),
    onSuccess: (data) => {
      setCreatedKey(data);
      setCopied(false);
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err) =>
      toast.error("Could not create key", {
        description: err instanceof Error ? err.message : undefined,
      }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: boolean }>(`/settings/api-keys/${id}`),
    onSuccess: () => {
      toast.success("API key revoked");
      setRevokeTarget(null);
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err) =>
      toast.error("Revoke failed", {
        description: err instanceof Error ? err.message : undefined,
      }),
  });

  async function copyKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      toast.success("Key copied to clipboard");
    } catch {
      toast.error("Copy failed — select the key text and copy it manually");
    }
  }

  function closeCreateDialog() {
    setCreateOpen(false);
    setCreatedKey(null);
    setKeyName("");
    setCopied(false);
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Keys authenticate programmatic access to the Fable API. Only a prefix is stored — the
          full key is shown once at creation.
        </p>
        <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> New key
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
          No API keys yet — create one to call the API from your own scripts.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-border/50">
          {apiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
                  <KeyRound className="h-4 w-4 text-violet-300" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{key.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{key.prefix}…</p>
                </div>
              </div>
              <div className="hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block">
                <p>Created {formatDate(key.createdAt)}</p>
                <p>Last used {formatDate(key.lastUsedAt)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 text-xs text-muted-foreground hover:text-red-400"
                onClick={() => setRevokeTarget(key)}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog — swaps to the show-once key view after creation. */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && closeCreateDialog()}>
        <DialogContent className="max-w-md">
          {createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>“{createdKey.name}” created</DialogTitle>
                <DialogDescription>Copy your key now — it will not be shown again.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-background/60 px-3 py-2.5 font-mono text-xs text-violet-200">
                    {createdKey.key}
                  </code>
                  <Button variant="secondary" size="icon" aria-label="Copy API key" onClick={() => void copyKey()}>
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <p className="text-xs leading-relaxed text-amber-200/90">
                    This is the only time the full key is visible. Store it in a secrets manager —
                    we keep just a hash and the prefix{" "}
                    <span className="font-mono">{createdKey.prefix}…</span>
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={closeCreateDialog}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>New API key</DialogTitle>
                <DialogDescription>
                  Name it after where it will be used so it is easy to revoke later.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="api-key-name">Key name</Label>
                <Input
                  id="api-key-name"
                  value={keyName}
                  maxLength={60}
                  placeholder="Zapier automation"
                  autoFocus
                  onChange={(e) => setKeyName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && keyName.trim() && !create.isPending) {
                      create.mutate(keyName.trim());
                    }
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={closeCreateDialog}>
                  Cancel
                </Button>
                <Button
                  disabled={!keyName.trim() || create.isPending}
                  onClick={() => create.mutate(keyName.trim())}
                >
                  {create.isPending ? "Creating…" : "Create key"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <Dialog open={revokeTarget !== null} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke API key?</DialogTitle>
            <DialogDescription>
              “{revokeTarget?.name}” ({revokeTarget?.prefix}…) will stop working immediately.
              Anything using it will start failing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => revokeTarget && revoke.mutate(revokeTarget.id)}
            >
              {revoke.isPending ? "Revoking…" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
