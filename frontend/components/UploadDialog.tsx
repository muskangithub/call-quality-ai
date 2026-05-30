"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileAudio, CheckCircle, AlertCircle, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { uploadCall, type UploadResponse } from "@/lib/api";
import { useCall } from "@/lib/hooks";
import Link from "next/link";

type UploadState = "idle" | "uploading" | "processing" | "completed" | "failed";

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Queued for processing",
  transcribing: "Transcribing audio…",
  analysing: "Analysing call…",
  completed: "Analysis complete",
  failed: "Processing failed",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadDialog({ onUploaded }: { onUploaded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { call } = useCall(uploadResult?.id ?? null);

  // Sync SWR data back to local state
  if (call && uploadState === "processing") {
    if (call.status === "completed") {
      setUploadState("completed");
      onUploaded?.();
    } else if (call.status === "failed") {
      setUploadState("failed");
      setError(call.errorMessage ?? "Processing failed");
    }
  }

  const handleFile = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      setError(null);
      setUploadState("uploading");
      setProgress(0);
      setUploadResult(null);

      try {
        const result = await uploadCall(file, (pct) => setProgress(pct));
        setUploadResult(result);
        setUploadState("processing");
        onUploaded?.();
      } catch (err) {
        setUploadState("failed");
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    },
    [onUploaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const reset = () => {
    setUploadState("idle");
    setProgress(0);
    setSelectedFile(null);
    setUploadResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Upload className="w-4 h-4 mr-2" />
          Upload Call
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a Call Recording</DialogTitle>
        </DialogHeader>

        {uploadState === "idle" && (
          <div
            className={`border-2 border-dashed rounded-lg transition-colors p-10 flex flex-col items-center justify-center gap-4 cursor-pointer
              ${dragActive ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400"}
            `}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/mp4,video/webm"
              className="hidden"
              onChange={handleInputChange}
            />
            <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 p-4">
              <Upload className="w-8 h-8 text-zinc-400" />
            </div>
            <div className="text-center">
              <p className="font-medium text-zinc-700 dark:text-zinc-300">
                Drag & drop your audio file here
              </p>
              <p className="text-sm text-zinc-400 mt-1">
                or click to browse — MP3, WAV, M4A, OGG, WebM up to 200 MB
              </p>
            </div>
          </div>
        )}

        {uploadState !== "idle" && (
          <div className="py-2">
            {selectedFile && (
              <div className="flex items-center gap-3 mb-4">
                <FileAudio className="w-5 h-5 text-zinc-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
            )}

            {uploadState === "uploading" && (
              <div>
                <div className="flex justify-between text-sm text-zinc-500 mb-1">
                  <span>Uploading…</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {uploadState === "processing" && (
              <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span>
                  {call ? STATUS_LABELS[call.status] ?? call.status : STATUS_LABELS["uploaded"]}
                </span>
              </div>
            )}

            {uploadState === "completed" && uploadResult && (
              <div>
                <div className="flex items-center gap-3 text-sm text-green-600 mb-3">
                  <CheckCircle className="w-4 h-4" />
                  <span>Analysis complete</span>
                </div>
                <Link href={`/calls/${uploadResult.id}`}>
                  <Button className="w-full">
                    <Eye className="w-4 h-4 mr-2" />
                    View Analysis
                  </Button>
                </Link>
              </div>
            )}

            {uploadState === "failed" && (
              <div className="flex items-center gap-3 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span>{error ?? "Something went wrong"}</span>
              </div>
            )}

            {(uploadState === "completed" || uploadState === "failed") && (
              <Button variant="outline" className="mt-3 w-full" onClick={reset}>
                Upload another call
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
