"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Scissors, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface CreatedKey {
  id: string;
  name: string;
  prefix: string;
  key: string;
  createdAt: string;
}

/**
 * Connect clip-engine: mint an ingest key and hand back the one command that
 * consumes it.
 *
 * Deliberately a generator, not a fetcher. clip-engine must already hold the
 * ingest key to authenticate, so it can never bootstrap its own credentials
 * from here — and returning a stored key would break the rule that full keys
 * are write-only (the settings API only ever reads back the last 4 chars).
 *
 * The Anthropic key is NOT collected here. `clip login` writes the studio URL
 * and this key to its own .env, then fetches the Anthropic key from Provider
 * keys above at run time — one place to keep it, nothing to paste twice.
 */
export function ClipEngineSection() {
  const qc = useQueryClient();
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const mint = useMutation({
    mutationFn: () =>
      api.post<CreatedKey>("/settings/api-keys", { name: "clip-engine" }),
    onSuccess: (key) => {
      setCreated(key);
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Ingest key created — copy the command below now");
    },
    onError: () => toast.error("Could not create the key. Try again."),
  });

  // The API is served from this same origin, and clip-engine appends
  // /api/v1/external/clips itself, so the bare origin is exactly right.
  const apiUrl = typeof window === "undefined" ? "" : window.location.origin;

  const command = created ? `clip login ${created.key} --url ${apiUrl}` : "";

  async function copyCommand() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success("Copied — run it in the clip-engine folder");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — select the text and copy it manually");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          clip-engine runs on your PC and pushes finished clips here as drafts
          for approval. Generate a key below and run one command — it picks up
          your Anthropic key from Provider keys above, so there is nothing else
          to paste.
        </p>
      </div>

      {!created ? (
        <Button
          className="gap-2"
          disabled={mint.isPending}
          onClick={() => mint.mutate()}
        >
          <Scissors className="h-4 w-4" />
          {mint.isPending ? "Generating…" : "Generate ingest key"}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p>
              The ingest key is shown once. Copy this command now — if you lose
              it, generate a new one and delete the old key below.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Run this in the clip-engine folder</Label>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={copyCommand}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-secondary/40 p-3 text-[11px] leading-relaxed">
              <code className="select-all break-all">{command}</code>
            </pre>
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Then run <code className="rounded bg-secondary px-1 py-0.5">clip doctor</code>{" "}
            — every check should pass. Save your Anthropic key in Provider keys
            above first, or the login step will tell you it is missing.
          </p>
        </div>
      )}
    </div>
  );
}
