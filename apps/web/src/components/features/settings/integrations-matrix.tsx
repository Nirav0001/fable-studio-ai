"use client";

import { useQuery } from "@tanstack/react-query";
import type { HealthReport } from "@fable/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface IntegrationRow {
  label: string;
  /** Green when true, amber (mock / fallback) when false. */
  active: boolean;
  /** Short status text shown on the right. */
  detail: string;
  /** How-to-enable hint, shown only while inactive. */
  hint: string;
}

function providerLabel(provider: HealthReport["aiProvider"]): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "gemini":
      return "Gemini";
    default:
      return "Deterministic mock";
  }
}

function buildRows(h: HealthReport): IntegrationRow[] {
  return [
    {
      label: "Database",
      active: h.db,
      detail: h.db ? "Connected" : "Unreachable",
      hint: "Check DATABASE_URL in apps/api/.env",
    },
    {
      label: "Queue",
      active: h.queueDriver === "bullmq",
      detail: h.queueDriver === "bullmq" ? "BullMQ + Redis" : "In-memory driver",
      hint: "Set REDIS_URL in apps/api/.env to enable BullMQ",
    },
    {
      label: "FFmpeg",
      active: h.ffmpeg,
      detail: h.ffmpeg ? "Rendering enabled" : "Simulated renders",
      hint: "Install ffmpeg or set FFMPEG_PATH in apps/api/.env",
    },
    {
      label: "yt-dlp",
      active: h.ytdlp,
      detail: h.ytdlp ? "Source download enabled" : "Mock transcripts",
      hint: "Install yt-dlp or set YTDLP_PATH in apps/api/.env",
    },
    {
      label: "AI provider",
      active: h.aiProvider !== "mock",
      detail: providerLabel(h.aiProvider),
      hint: "Add OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY to apps/api/.env",
    },
    {
      label: "OpenAI",
      active: h.providers.openai,
      detail: h.providers.openai ? "Key set" : "No key",
      hint: "Add OPENAI_API_KEY to apps/api/.env",
    },
    {
      label: "Anthropic",
      active: h.providers.anthropic,
      detail: h.providers.anthropic ? "Key set" : "No key",
      hint: "Add ANTHROPIC_API_KEY to apps/api/.env",
    },
    {
      label: "Gemini",
      active: h.providers.gemini,
      detail: h.providers.gemini ? "Key set" : "No key",
      hint: "Add GEMINI_API_KEY to apps/api/.env",
    },
    {
      label: "ElevenLabs",
      active: h.providers.elevenlabs,
      detail: h.providers.elevenlabs ? "Key set" : "Mock voiceover",
      hint: "Add ELEVENLABS_API_KEY to apps/api/.env",
    },
    {
      label: "YouTube OAuth",
      active: h.youtube,
      detail: h.youtube ? "Client configured" : "Mock uploads",
      hint: "Add YT_CLIENT_ID and YT_CLIENT_SECRET to apps/api/.env",
    },
    {
      label: "Stripe",
      active: h.stripe,
      detail: h.stripe ? "Live billing" : "Mock billing",
      hint: "Add STRIPE_SECRET_KEY to apps/api/.env",
    },
    {
      label: "Storage",
      active: h.storage === "r2",
      detail: h.storage === "r2" ? "Cloudflare R2" : "Local disk",
      hint: "Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY to apps/api/.env",
    },
  ];
}

export function IntegrationsMatrix() {
  const { data: health, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<HealthReport>("/health"),
  });

  if (isLoading) {
    return (
      <div className="glass space-y-3 rounded-2xl p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!health) {
    return (
      <div className="glass rounded-2xl p-5 text-sm text-muted-foreground">
        Could not reach the API health endpoint — is the API running on port 4100?
      </div>
    );
  }

  const rows = buildRows(health);
  const activeCount = rows.filter((r) => r.active).length;

  return (
    <div className="glass rounded-2xl p-5">
      <p className="mb-3 text-xs text-muted-foreground">
        {activeCount} of {rows.length} integrations live — everything else runs on deterministic
        mocks, so the whole pipeline still works end-to-end.
      </p>
      <div className="divide-y divide-border/50">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 py-2.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  row.active
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                    : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]",
                )}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.label}</p>
                {!row.active && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{row.hint}</p>
                )}
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 pt-0.5 text-xs",
                row.active ? "text-emerald-300" : "text-amber-300",
              )}
            >
              {row.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
