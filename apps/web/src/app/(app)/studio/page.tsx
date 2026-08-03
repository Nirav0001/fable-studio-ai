"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Activity, Coins, ListTodo, UploadCloud, Zap } from "lucide-react";
import { formatCompact, formatGbp } from "@fable/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/widgets/page-header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

type AgentKey = "writer" | "voice" | "render" | "upload" | "analyst";

interface StudioState {
  agents: { key: AgentKey; status: "idle" | "working" | "queued"; task: string | null; progress: number | null }[];
  logs: { atMs: number; agent: AgentKey | "system"; job: string; line: string }[];
  usage: { tokens: number; estCostGbp: number; sinceLabel: string };
  counters: {
    generatedToday: number;
    rendersToday: number;
    uploadsToday: number;
    uploadQuota: number;
    queueDepth: number;
  };
}

const AGENT_META: Record<
  AgentKey,
  { name: string; role: string; emoji: string; color: string; gradient: string }
> = {
  writer: {
    name: "Quill",
    role: "Scriptwriter · GPT",
    emoji: "✍️",
    color: "text-violet-300",
    gradient: "from-violet-500 to-fuchsia-500",
  },
  voice: {
    name: "George",
    role: "Voiceover · ElevenLabs",
    emoji: "🎙️",
    color: "text-pink-300",
    gradient: "from-pink-500 to-rose-500",
  },
  render: {
    name: "Bay-1",
    role: "Render bay · FFmpeg",
    emoji: "🎬",
    color: "text-blue-300",
    gradient: "from-blue-500 to-indigo-500",
  },
  upload: {
    name: "Dock",
    role: "Upload dock · YouTube",
    emoji: "📤",
    color: "text-emerald-300",
    gradient: "from-emerald-500 to-teal-500",
  },
  analyst: {
    name: "Ledger",
    role: "Stats analyst · Data API",
    emoji: "📊",
    color: "text-amber-300",
    gradient: "from-amber-500 to-orange-500",
  },
};

const LOG_COLORS: Record<string, string> = {
  writer: "text-violet-400",
  voice: "text-pink-400",
  render: "text-blue-400",
  upload: "text-emerald-400",
  analyst: "text-amber-400",
  system: "text-zinc-400",
};

function AgentCharacter({
  agent,
  index,
}: {
  agent: StudioState["agents"][number];
  index: number;
}) {
  const meta = AGENT_META[agent.key];
  const working = agent.status === "working";
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="relative flex w-32 flex-col items-center sm:w-40"
    >
      {/* Task speech bubble */}
      {working && agent.task && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="absolute -top-14 z-10 w-44 rounded-xl border border-primary/30 bg-popover/95 px-3 py-2 text-center shadow-xl backdrop-blur-xl"
        >
          <p className="truncate text-[11px] font-medium">{agent.task}</p>
          {agent.progress !== null && <Progress value={agent.progress} className="mt-1.5 h-1" />}
          <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-primary/30 bg-popover/95" />
        </motion.div>
      )}

      {/* The 3D character */}
      <motion.div
        animate={working ? { y: [0, -8, 0] } : { y: [0, -3, 0] }}
        transition={{ duration: working ? 1.4 : 3.2, repeat: Infinity, ease: "easeInOut" }}
        className={cn(
          "relative overflow-hidden rounded-2xl ring-1 transition-all",
          working ? "ring-primary/50 glow-primary" : "ring-border/50 opacity-80 saturate-[0.8]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/studio/${agent.key}.png`}
          alt={meta.name}
          className="h-28 w-28 object-cover sm:h-36 sm:w-36"
        />
      </motion.div>

      {/* Floor shadow */}
      <div
        className={cn(
          "mt-2 h-2.5 w-20 rounded-[100%] bg-black/50 blur-[3px] transition-opacity",
          working ? "opacity-90" : "opacity-50",
        )}
      />

      <div className="mt-2 flex items-center gap-1.5">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            working ? "animate-pulse-glow bg-emerald-400" : "bg-zinc-600",
          )}
        />
        <p className="font-display text-sm font-bold">{meta.name}</p>
      </div>
      <p className={cn("text-[10.5px]", meta.color)}>{meta.role}</p>
    </motion.div>
  );
}

export default function StudioPage() {
  const state = useQuery({
    queryKey: ["studio-state"],
    queryFn: () => api.get<StudioState>("/studio/state"),
    refetchInterval: 2500,
  });
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.data?.logs]);

  const d = state.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Studio Floor"
        description="Your AI crew at work — live pipeline, real logs, real spend."
      />

      {!d ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* ── The studio floor: isometric grid + 3D crew ── */}
          <div className="glass relative overflow-hidden rounded-3xl px-4 pb-6 pt-20">
            {/* Perspective floor grid */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[-20%] bottom-[-10%] h-3/5 opacity-60"
              style={{
                transform: "perspective(700px) rotateX(58deg)",
                backgroundImage:
                  "repeating-linear-gradient(0deg, hsl(263 60% 60% / 0.16) 0 1px, transparent 1px 44px), repeating-linear-gradient(90deg, hsl(263 60% 60% / 0.16) 0 1px, transparent 1px 44px)",
                maskImage: "linear-gradient(to top, black 30%, transparent)",
                WebkitMaskImage: "linear-gradient(to top, black 30%, transparent)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/10 to-transparent"
            />
            <div className="relative flex flex-wrap items-end justify-center gap-x-2 gap-y-10 sm:justify-around">
              {d.agents.map((agent, i) => (
                <AgentCharacter key={agent.key} agent={agent} index={i} />
              ))}
            </div>
          </div>

          {/* ── Counters + spend ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  AI credits burned
                </p>
                <Coins className="h-4 w-4 text-amber-400" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold">
                {formatCompact(d.usage.tokens)} <span className="text-sm font-normal text-muted-foreground">tokens</span>
              </p>
              <p className="text-xs text-muted-foreground">
                ≈ {formatGbp(d.usage.estCostGbp)} {d.usage.sinceLabel}
              </p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Made today
                </p>
                <Zap className="h-4 w-4 text-violet-400" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold">{d.counters.generatedToday}</p>
              <p className="text-xs text-muted-foreground">{d.counters.rendersToday} rendered</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Upload quota
                </p>
                <UploadCloud className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold">
                {d.counters.uploadsToday}
                <span className="text-sm font-normal text-muted-foreground"> / {d.counters.uploadQuota} today</span>
              </p>
              <Progress
                value={(d.counters.uploadsToday / d.counters.uploadQuota) * 100}
                className="mt-2 h-1.5"
              />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Queue depth
                </p>
                <ListTodo className="h-4 w-4 text-blue-400" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold">{d.counters.queueDepth}</p>
              <p className="text-xs text-muted-foreground">jobs waiting</p>
            </motion.div>
          </div>

          {/* ── Live terminal ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass overflow-hidden rounded-2xl"
          >
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
              <Activity className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Terminal
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-emerald-400" />
                live
              </span>
            </div>
            <div
              ref={terminalRef}
              className="max-h-80 space-y-0.5 overflow-y-auto p-4 font-mono text-[11.5px] leading-relaxed"
            >
              {d.logs.length === 0 && (
                <p className="text-muted-foreground">No activity yet — kick off a project and watch the crew go.</p>
              )}
              {d.logs.map((log, i) => (
                <div key={`${log.atMs}-${i}`} className="flex gap-2">
                  <span className="shrink-0 text-zinc-500">
                    {new Date(log.atMs).toLocaleTimeString("en-GB", { hour12: false })}
                  </span>
                  <span className={cn("shrink-0 font-semibold", LOG_COLORS[log.agent])}>
                    {AGENT_META[log.agent as AgentKey]?.name ?? "system"}
                  </span>
                  <span className="text-foreground/85">{log.line}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
