"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { LayoutTemplate, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { safeJson } from "@fable/shared";
import { api } from "@/lib/api";
import { EASE_OUT, staggerDelay } from "@/lib/motion";
import { PageHeader } from "@/components/widgets/page-header";
import { EmptyState } from "@/components/widgets/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TEMPLATE_KINDS,
  TemplateDialog,
  type TemplateT,
} from "@/components/features/templates/template-dialog";

interface TemplateRaw {
  id: string;
  name: string;
  kind: string;
  description?: string;
  accent?: string;
  builtIn?: boolean;
  config?: unknown;
  configJson?: string;
  createdAt?: string;
}

function normalizeTemplate(raw: TemplateRaw): TemplateT {
  let config: Record<string, unknown> = {};
  if (raw.config && typeof raw.config === "object" && !Array.isArray(raw.config)) {
    config = raw.config as Record<string, unknown>;
  } else if (typeof raw.configJson === "string") {
    config = safeJson<Record<string, unknown>>(raw.configJson, {});
  }
  return {
    id: raw.id,
    name: raw.name,
    kind: raw.kind,
    description: raw.description ?? "",
    accent: raw.accent ?? "#8b5cf6",
    builtIn: raw.builtIn ?? false,
    config,
    createdAt: raw.createdAt ?? "",
  };
}

export default function TemplatesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateT | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TemplateT | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const raw = await api.get<TemplateRaw[]>("/templates");
      return raw.map(normalizeTemplate);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<Record<string, never>>(`/templates/${id}`),
    onSuccess: () => {
      toast.success("Template deleted");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err) =>
      toast.error("Delete failed", {
        description: err instanceof Error ? err.message : undefined,
      }),
  });

  const groups = TEMPLATE_KINDS.map((kind) => ({
    ...kind,
    items: (templates ?? []).filter((t) => t.kind === kind.value),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Templates"
        description="Reusable styling presets — pick one in the New Project wizard to apply it."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> New template
          </Button>
        }
      />

      {isLoading && (
        <div className="space-y-8">
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g} className="space-y-3">
              <Skeleton className="h-5 w-44 rounded-lg" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-2xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && (templates ?? []).length === 0 && (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          body="Create your first styling preset — it will show up as an option when generating projects."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Create template
            </Button>
          }
        />
      )}

      {!isLoading &&
        groups.map((group, gi) => (
          <motion.section
            key={group.value}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="space-y-3"
          >
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-display text-base font-semibold tracking-tight">{group.label}</h2>
              <span className="text-xs text-muted-foreground">{group.blurb}</span>
              <Badge variant="secondary" className="ml-auto">
                {group.items.length}
              </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((template, i) => {
                const style = typeof template.config.style === "string" ? template.config.style : null;
                const pace = typeof template.config.pace === "string" ? template.config.pace : null;
                const cta = typeof template.config.cta === "string" ? template.config.cta : null;
                return (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE_OUT, delay: staggerDelay(i, 5) }}
                    className="glass glass-hover flex flex-col gap-3 rounded-2xl p-5"
                    style={{ borderLeft: `3px solid ${template.accent}` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: template.accent }}
                        />
                        <p className="truncate text-sm font-semibold">{template.name}</p>
                      </div>
                      {template.builtIn && (
                        <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                          <Sparkles className="h-3 w-3" /> Built-in
                        </Badge>
                      )}
                    </div>

                    {template.description && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {template.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {style && (
                        <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium capitalize text-secondary-foreground">
                          {style}
                        </span>
                      )}
                      {pace && (
                        <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium capitalize text-secondary-foreground">
                          {pace} pace
                        </span>
                      )}
                      {cta && (
                        <span className="max-w-[180px] truncate rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                          “{cta}”
                        </span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center justify-end gap-1 border-t border-border/40 pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => {
                          setEditing(template);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      {!template.builtIn && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-red-400"
                          onClick={() => setPendingDelete(template)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        ))}

      <TemplateDialog open={dialogOpen} onOpenChange={setDialogOpen} template={editing} />

      <Dialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete template?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.name}” will be removed. Projects already generated with it are not
              affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
