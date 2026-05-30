"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileAudio, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { uploadCall, type UploadResponse } from "@/lib/api";
import { useCall } from "@/lib/hooks";

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

export default function Home() {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // SWR handles polling automatically — refreshes every 3s until terminal state
  const { call } = useCall(uploadResult?.id ?? null);

  // Sync SWR data back to local UI state
  if (call && uploadState === "processing") {
    if (call.status === "completed") {
      setUploadState("completed");
    } else if (call.status === "failed") {
      setUploadState("failed");
      setError(call.errorMessage ?? "Processing failed");
    }
  }

  const handleFile = useCallback(async (file: File) => {
    setSelectedFile(file);
    setError(null);
    setUploadState("uploading");
    setProgress(0);
    setUploadResult(null);

    try {
      const result = await uploadCall(file, (pct) => setProgress(pct));
      setUploadResult(result);
      setUploadState("processing");
    } catch (err) {
      setUploadState("failed");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragActive(false), []);

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
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Call Quality AI
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8">
          Upload a call recording to get an automated quality analysis.
        </p>

        {/* Upload area */}
        <Card
          className={`relative border-2 border-dashed transition-colors p-10 flex flex-col items-center justify-center gap-4 cursor-pointer
            ${dragActive ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400"}
            ${uploadState !== "idle" ? "pointer-events-none opacity-60" : ""}
          `}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => uploadState === "idle" && fileInputRef.current?.click()}
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
        </Card>

        {/* Status section */}
        {uploadState !== "idle" && (
          <Card className="mt-6 p-6">
            {/* File info */}
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

            {/* Upload progress bar */}
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

            {/* Processing status */}
            {uploadState === "processing" && (
              <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span>
                  {call
                    ? STATUS_LABELS[call.status] ?? call.status
                    : STATUS_LABELS["uploaded"]}
                </span>
              </div>
            )}

            {/* Completed */}
            {uploadState === "completed" && (
              <div className="flex items-center gap-3 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>Analysis complete</span>
              </div>
            )}

            {/* Failed */}
            {uploadState === "failed" && (
              <div className="flex items-center gap-3 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span>{error ?? "Something went wrong"}</span>
              </div>
            )}

            {/* Reset button */}
            {(uploadState === "completed" || uploadState === "failed") && (
              <Button variant="outline" className="mt-4" onClick={reset}>
                Upload another call
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
