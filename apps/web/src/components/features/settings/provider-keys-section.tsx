"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface KeyStatus {
  set: boolean;
  source: "user" | "env" | null;
  hint: string | null;
}

interface KeysResponse {
  keys: Record<string, KeyStatus>;
  oauthRedirectUri: string;
}

const FIELDS = [
  {
    field: "openaiKey",
    label: "OpenAI API key",
    placeholder: "sk-…",
    help: "Powers questions, SEO, thumbnails and Whisper transcription.",
  },
  {
    field: "elevenlabsKey",
    label: "ElevenLabs API key",
    placeholder: "Your ElevenLabs key",
    help: "Powers voiceovers and the background music bed.",
  },
  {
    field: "ytClientId",
    label: "YouTube OAuth Client ID",
    placeholder: "…apps.googleusercontent.com",
    help: "Google Cloud Console → APIs & Services → Credentials → OAuth client.",
  },
  {
    field: "ytClientSecret",
    label: "YouTube OAuth Client Secret",
    placeholder: "GOCSPX-…",
    help: "The secret of the same OAuth client as the ID above.",
  },
] as const;

function SourceBadge({ status }: { status?: KeyStatus }) {
  if (status?.source === "user") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300">
        <ShieldCheck className="h-3 w-3" />
        Your key {status.hint ?? ""}
      </span>
    );
  }
  if (status?.source === "env") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
        <Check className="h-3 w-3" />
        Server key active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
      Not set
    </span>
  );
}

export function ProviderKeysSection() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["provider-keys"],
    queryFn: () => api.get<KeysResponse>("/settings/keys"),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api.put<KeysResponse>("/settings/keys", body),
    onSuccess: () => {
      toast.success("Keys saved — they take effect immediately");
      setDrafts({});
      qc.invalidateQueries({ queryKey: ["provider-keys"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not save keys"),
  });

  const clearKey = useMutation({
    mutationFn: (field: string) => api.put<KeysResponse>("/settings/keys", { [field]: "" }),
    onSuccess: () => {
      toast.success("Key removed");
      qc.invalidateQueries({ queryKey: ["provider-keys"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not remove key"),
  });

  const dirty = Object.entries(drafts).filter(([, v]) => v.trim().length > 0);

  function submit() {
    if (dirty.length === 0) return;
    save.mutate(Object.fromEntries(dirty.map(([k, v]) => [k, v.trim()])));
  }

  async function copyRedirect() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.oauthRedirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copy failed — select and copy the URL manually");
    }
  }

  return (
    <div className="glass space-y-5 rounded-2xl p-5">
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading key status…
        </div>
      )}

      {isError && !isLoading && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load your key status — the API may still be starting up.
          </p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <div className="space-y-4">
            {FIELDS.map(({ field, label, placeholder, help }) => {
              const status = data?.keys?.[field];
              return (
                <div key={field} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`pk-${field}`} className="flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-primary/70" />
                      {label}
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <SourceBadge status={status} />
                      {status?.source === "user" && (
                        <button
                          type="button"
                          title="Remove your key"
                          onClick={() => clearKey.mutate(field)}
                          className="rounded-md p-0.5 text-muted-foreground transition hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <Input
                    id={`pk-${field}`}
                    type="password"
                    autoComplete="off"
                    placeholder={
                      status?.source === "user"
                        ? `Saved ${status.hint ?? ""} — paste to replace`
                        : placeholder
                    }
                    value={drafts[field] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [field]: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">{help}</p>
                </div>
              );
            })}
          </div>

          <Button
            onClick={submit}
            disabled={dirty.length === 0 || save.isPending}
            className="w-full"
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save {dirty.length > 0 ? `${dirty.length} key${dirty.length > 1 ? "s" : ""}` : "keys"}
          </Button>

          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3.5">
            <p className="text-xs font-medium">Connecting YouTube: one extra step in Google</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              In Google Cloud Console open your OAuth client and add this exact URL under{" "}
              <span className="text-foreground">Authorized redirect URIs</span> — then hit
              Connect on your channel:
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-background/60 px-2.5 py-1.5 text-[11px] text-foreground">
                {data?.oauthRedirectUri}
              </code>
              <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-[11px]" onClick={copyRedirect}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Keys are encrypted before they touch the database and are never shown again in
            full — only the last 4 characters. Leave a field empty to keep using the
            server&apos;s built-in key where one exists.
          </p>
        </>
      )}
    </div>
  );
}
