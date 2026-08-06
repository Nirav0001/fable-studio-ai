"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Scissors, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreatedKey {
  id: string;
  name: string;
  prefix: string;
  key: string;
  createdAt: string;
}

/** Where the pipeline expects its config file, shown so the paste has a home. */
const ENV_PATH = "clip-engine\\.env";

/**
 * Connect clip-engine: mint an ingest key and hand back a ready-to-paste .env.
 *
 * Deliberately a generator, not a fetcher. clip-engine must already hold the
 * ingest key to authenticate, so it can never bootstrap its own credentials
 * from here — and returning a stored key would break the rule that full keys
 * are write-only (the settings API only ever reads back the last 4 chars).
 * The Anthropic key typed below is never sent to the server: it is composed
 * into the snippet in the browser and forgotten on reload.
 */
export function ClipEngineSection() {
  const qc = useQueryClient();
  const [anthropicKey, setAnthropicKey] = useState("");
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const mint = useMutation({
    mutationFn: () =>
      api.post<CreatedKey>("/settings/api-keys", { name: "clip-engine" }),
    onSuccess: (key) => {
      setCreated(key);
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Ingest key created — copy the block below now");
    },
    onError: () => toast.error("Could not create the key. Try again."),
  });

  // The API is served from this same origin, and clip-engine appends
  // /api/v1/external/clips itself, so the bare origin is exactly right.
  const apiUrl = typeof window === "undefined" ? "" : window.location.origin;

  const envBlock = created
    ? [
        `FABLE_API_URL=${apiUrl}`,
        `FABLE_INGEST_KEY=${created.key}`,
        `ANTHROPIC_API_KEY=${anthropicKey.trim() || "sk-ant-your-key-here"}`,
        `CLIP_DATA_DIR=C:\\clip-engine-data`,
      ].join("\n")
    : "";

  async function copyBlock() {
    if (!envBlock) return;
    try {
      await navigator.clipboard.writeText(envBlock);
      setCopied(true);
      toast.success(`Copied — paste it into ${ENV_PATH}`);
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
          for approval. Generate its settings below, then paste them into{" "}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">
            {ENV_PATH}
          </code>
          .
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="clip-anthropic">Anthropic API key</Label>
        <Input
          id="clip-anthropic"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-..."
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">
          Used on your own machine to rank moments and write titles. It is put
          straight into the snippet in your browser and never sent to this
          server — leave it blank and the snippet leaves a placeholder instead.
        </p>
      </div>

      {!created ? (
        <Button
          className="gap-2"
          disabled={mint.isPending}
          onClick={() => mint.mutate()}
        >
          <Scissors className="h-4 w-4" />
          {mint.isPending ? "Generating…" : "Generate clip-engine settings"}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p>
              The ingest key is shown once. Copy this block now — if you lose
              it, generate a new one and delete the old key below.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>
                Paste into{" "}
                <code className="rounded bg-secondary px-1 py-0.5 text-xs">
                  {ENV_PATH}
                </code>
              </Label>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={copyBlock}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-secondary/40 p-3 text-[11px] leading-relaxed">
              <code className="select-all break-all">{envBlock}</code>
            </pre>
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Then run <code className="rounded bg-secondary px-1 py-0.5">clip doctor</code>{" "}
            in the clip-engine folder — every check should pass.
          </p>
        </div>
      )}
    </div>
  );
}
