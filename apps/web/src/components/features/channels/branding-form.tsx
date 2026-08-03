"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Palette, Save, Type as TypeIcon, Volume2 } from "lucide-react";
import type { Branding, VoiceConfig } from "@fable/shared";
import { VOICE_PRESETS } from "@fable/shared";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COLOR_PRESETS = ["#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#6366f1", "#3b82f6"];
const FONTS = ["Inter", "Space Grotesk", "Montserrat", "Bangers"];
const ENERGIES: VoiceConfig["energy"][] = ["calm", "medium", "high", "hyper"];
const EMOTIONS: VoiceConfig["emotion"][] = ["neutral", "excited", "dramatic", "funny"];

function normalizeBranding(raw: Partial<Branding> | undefined): Branding {
  const voice: Partial<VoiceConfig> = raw?.voice ?? {};
  return {
    primaryColor: raw?.primaryColor ?? "#8b5cf6",
    secondaryColor: raw?.secondaryColor ?? "#d946ef",
    font: raw?.font ?? "Inter",
    logoAssetId: raw?.logoAssetId,
    watermarkText: raw?.watermarkText ?? "",
    introText: raw?.introText ?? "",
    outroText: raw?.outroText ?? "",
    cta: raw?.cta ?? "",
    musicStyle: raw?.musicStyle ?? "upbeat",
    voice: {
      provider: voice.provider ?? "openai",
      voiceId: voice.voiceId ?? "onyx-uk",
      gender: voice.gender ?? "male",
      accent: voice.accent ?? "british",
      energy: voice.energy ?? "high",
      emotion: voice.emotion ?? "excited",
    },
  };
}

export function BrandingForm({
  channelId,
  branding,
}: {
  channelId: string;
  branding: Partial<Branding> | undefined;
}) {
  const qc = useQueryClient();
  const [b, setB] = useState<Branding>(() => normalizeBranding(branding));

  const save = useMutation({
    mutationFn: () => api.patch(`/channels/${channelId}`, { branding: b }),
    onSuccess: () => {
      toast.success("Branding saved");
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not save branding"),
  });

  const setVoice = (patch: Partial<VoiceConfig>) =>
    setB((prev) => ({ ...prev, voice: { ...prev.voice, ...patch } }));

  return (
    <div className="space-y-5">
      {/* Live preview strip */}
      <div
        className="flex items-center justify-between rounded-2xl p-5"
        style={{ backgroundImage: `linear-gradient(135deg, ${b.primaryColor}, ${b.secondaryColor})` }}
      >
        <span className="text-base font-bold text-white drop-shadow" style={{ fontFamily: b.font }}>
          {b.cta || "Follow for daily Shorts!"}
        </span>
        <span className="text-[11px] font-medium text-white/85">
          {b.watermarkText || "watermark"}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="glass rounded-2xl p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="h-4 w-4 text-primary" /> Colours & font
          </h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Primary colour</Label>
              <SwatchRow value={b.primaryColor} onChange={(c) => setB({ ...b, primaryColor: c })} />
            </div>
            <div className="space-y-2">
              <Label>Secondary colour</Label>
              <SwatchRow value={b.secondaryColor} onChange={(c) => setB({ ...b, secondaryColor: c })} />
            </div>
            <div className="space-y-1.5">
              <Label>Font</Label>
              <Select value={b.font} onValueChange={(v) => setB({ ...b, font: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a font" />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map((f) => (
                    <SelectItem key={f} value={f}>
                      <span style={{ fontFamily: f }}>{f}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="glass rounded-2xl p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Volume2 className="h-4 w-4 text-primary" /> Voiceover
          </h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Voice preset</Label>
              <Select
                value={b.voice.voiceId}
                onValueChange={(id) => {
                  const preset = VOICE_PRESETS.find((p) => p.id === id);
                  if (preset) {
                    setVoice({
                      provider: preset.provider,
                      voiceId: preset.id,
                      gender: preset.gender,
                      accent: preset.accent,
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a voice" />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Energy</Label>
                <Select
                  value={b.voice.energy}
                  onValueChange={(v) => setVoice({ energy: v as VoiceConfig["energy"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENERGIES.map((e) => (
                      <SelectItem key={e} value={e} className="capitalize">
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Emotion</Label>
                <Select
                  value={b.voice.emotion}
                  onValueChange={(v) => setVoice({ emotion: v as VoiceConfig["emotion"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMOTIONS.map((e) => (
                      <SelectItem key={e} value={e} className="capitalize">
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Presets map to real TTS voices when an API key is configured — the demo pipeline uses a
              deterministic mock voice.
            </p>
          </div>
        </section>
      </div>

      <section className="glass rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <TypeIcon className="h-4 w-4 text-primary" /> On-screen copy
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="branding-cta">Call to action</Label>
            <Input
              id="branding-cta"
              placeholder="Follow for daily brain teasers!"
              value={b.cta}
              onChange={(e) => setB({ ...b, cta: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branding-watermark">Watermark text</Label>
            <Input
              id="branding-watermark"
              placeholder="@yourhandle"
              value={b.watermarkText}
              onChange={(e) => setB({ ...b, watermarkText: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branding-intro">Intro text</Label>
            <Input
              id="branding-intro"
              placeholder="You have 5 seconds to choose…"
              value={b.introText}
              onChange={(e) => setB({ ...b, introText: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branding-outro">Outro text</Label>
            <Input
              id="branding-outro"
              placeholder="Comment your pick below!"
              value={b.outroText}
              onChange={(e) => setB({ ...b, outroText: e.target.value })}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button className="gap-2" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save branding
        </Button>
      </div>
    </div>
  );
}

function SwatchRow({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Colour ${c}`}
          onClick={() => onChange(c)}
          className={cn(
            "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
            value.toLowerCase() === c
              ? "border-white shadow-[0_0_0_3px_rgba(139,92,246,0.45)]"
              : "border-transparent",
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}
