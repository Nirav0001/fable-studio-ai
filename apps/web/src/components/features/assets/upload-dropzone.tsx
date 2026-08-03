"use client";

import { useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { apiUpload } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ASSET_KIND_META, inferKind, type AssetT } from "./asset-kinds";

interface UploadState {
  fileName: string;
  index: number;
  total: number;
}

interface UploadDropzoneProps {
  /** Called after each successful upload so the parent can refetch. */
  onUploaded: () => void;
}

export function UploadDropzone({ onUploaded }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<UploadState | null>(null);

  async function uploadAll(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploading({ fileName: file.name, index: i + 1, total: files.length });

      const kind = inferKind(file);
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      form.append("name", file.name.replace(/\.[^.]+$/, ""));

      try {
        await apiUpload<AssetT>("/assets", form);
        toast.success(`Uploaded ${file.name}`, {
          description: `Filed under ${ASSET_KIND_META[kind].label}`,
        });
        onUploaded();
      } catch (err) {
        toast.error(`Upload failed — ${file.name}`, {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
    setUploading(null);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload assets"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void uploadAll(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
        dragOver
          ? "border-primary/70 bg-primary/10"
          : "border-border/80 bg-secondary/20 hover:border-primary/40 hover:bg-secondary/30",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="audio/*,video/*,image/*,.ttf,.otf"
        className="hidden"
        onChange={(e) => {
          void uploadAll(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="gradient-primary flex h-12 w-12 items-center justify-center rounded-2xl glow-primary">
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        ) : (
          <UploadCloud className="h-6 w-6 text-white" />
        )}
      </div>

      {uploading ? (
        <div>
          <p className="text-sm font-medium">
            Uploading {uploading.fileName}
            {uploading.total > 1 && (
              <span className="text-muted-foreground">
                {" "}
                ({uploading.index}/{uploading.total})
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Each file gets its own toast when done</p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium">
            Drop files here or <span className="text-primary">click to browse</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Audio → music · GIFs → gifs · images → logos · .ttf/.otf → fonts · video up to 200MB
          </p>
        </div>
      )}
    </div>
  );
}
