"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ChannelSummary, ClipsConfig, Top5Config, WyrConfig } from "@fable/shared";
import { api } from "@/lib/api";
import { CHANNEL_TYPE_META } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/widgets/page-header";
import {
  INITIAL_WIZARD_STATE,
  StepChannel,
  StepConfig,
  StepReview,
  WizardDots,
  type WizardState,
} from "@/components/features/projects/wizard-steps";
import { isValidHttpUrl } from "@/components/features/projects/types";

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [state, setState] = useState<WizardState>(INITIAL_WIZARD_STATE);

  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));

  const channels = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.get<ChannelSummary[]>("/channels"),
  });

  const selectedChannel = (channels.data ?? []).find((c) => c.id === state.channelId);
  const type = state.type;

  const goTo = (target: number) => {
    setDirection(target > step ? 1 : -1);
    setStep(target);
  };

  const canContinue =
    step === 0
      ? Boolean(state.channelId && type)
      : step === 1
        ? type === "wyr" || isValidHttpUrl(state.sourceUrl)
        : true;

  const create = useMutation({
    mutationFn: () => {
      if (!state.channelId || !type) throw new Error("Pick a channel first");
      let config: WyrConfig | ClipsConfig | Top5Config;
      if (type === "wyr") {
        config = {
          difficulty: state.difficulty,
          theme: state.theme,
          lengthSec: state.lengthSec,
          questionCount: state.questionCount,
        };
      } else if (type === "clips") {
        config = {
          sourceUrl: state.sourceUrl.trim(),
          clipCount: state.clipCount,
          minScore: state.minScore,
          captionStyle: state.captionStyle,
          addMemes: state.addMemes,
        };
      } else {
        config = {
          sourceUrl: state.sourceUrl.trim(),
          countdownFrom: 5,
          captionStyle: state.captionStyle,
        };
      }
      return api.post<{ id: string }>("/projects", {
        channelId: state.channelId,
        type,
        config,
        ...(type !== "wyr" ? { sourceUrl: state.sourceUrl.trim() } : {}),
        ...(state.title.trim() ? { title: state.title.trim() } : {}),
      });
    },
    onSuccess: (project) => {
      toast.success("Generation started", {
        description: "The AI is writing your script — watch it live.",
      });
      router.push(`/projects/${project.id}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create project"),
  });

  const meta = type ? CHANNEL_TYPE_META[type] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New AI Project"
        description="Three steps between you and a review-ready Short."
        actions={
          <Button asChild variant="ghost" className="gap-1.5">
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" /> All projects
            </Link>
          </Button>
        }
      />

      <WizardDots step={step} onStepClick={goTo} />

      <div className="mx-auto w-full max-w-4xl overflow-x-hidden px-1 pb-4 pt-2">
        {/* Keyed entrance-only animation: exit animations stall under React
            Strict Mode double-mount in dev, so the step swap must never depend
            on an exit completing. */}
        <motion.div
          key={step}
          initial={{ opacity: 0, x: direction > 0 ? 48 : -48 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
            {step === 0 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Which channel is this Short for?
                </h2>
                <StepChannel
                  channels={channels.data}
                  loading={channels.isLoading}
                  selectedId={state.channelId}
                  onSelect={(c) => {
                    patch({ channelId: c.id, type: c.type });
                    setDirection(1);
                    setStep(1);
                  }}
                />
              </div>
            )}

            {step === 1 && type && (
              <div className="space-y-5">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Configure your {meta?.emoji} {meta?.label} Short
                </h2>
                <StepConfig type={type} state={state} patch={patch} />
              </div>
            )}

            {step === 2 && type && (
              <StepReview
                channel={selectedChannel}
                type={type}
                state={state}
                patch={patch}
                onGenerate={() => create.mutate()}
                generating={create.isPending}
              />
            )}
        </motion.div>
      </div>

      {/* ── Footer nav ──────────────────────────────────────────────── */}
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between border-t border-border/60 px-1 pt-4">
        <Button
          variant="ghost"
          className="gap-1.5"
          disabled={step === 0 || create.isPending}
          onClick={() => goTo(step - 1)}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {step < 2 ? (
          <Button className="gap-1.5" disabled={!canContinue} onClick={() => goTo(step + 1)}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Ready when you are — hit Generate above.
          </span>
        )}
      </div>
    </div>
  );
}
