"use client";

import { use } from "react";
import { useCall } from "@/lib/hooks";
import { ArrowLeft, FileAudio, Loader2, User, Headset, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScorecardView } from "@/components/Scorecard";
import { EmotionChart } from "@/components/EmotionChart";
import { AudioPlayer } from "@/components/AudioPlayer";
import Link from "next/link";
import type { DiarizedSegment } from "@/lib/api";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Chat Bubble Component ────────────────────────────────────────────────────

function ChatBubble({ segment }: { segment: DiarizedSegment }) {
  const isAgent = segment.speaker === "Agent";

  return (
    <div className={`flex gap-3 ${isAgent ? "justify-start" : "justify-end"}`}>
      {isAgent && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <Headset className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
      )}

      <div className={`max-w-[75%] ${isAgent ? "" : "order-first"}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isAgent
              ? "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-tl-sm"
              : "bg-blue-500 text-white rounded-tr-sm"
          }`}
        >
          {segment.text}
        </div>
        <p className={`text-xs text-zinc-400 mt-1 ${isAgent ? "text-left" : "text-right"}`}>
          {segment.speaker} · {formatTime(segment.start)}
        </p>
      </div>

      {!isAgent && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <User className="w-4 h-4 text-green-600 dark:text-green-400" />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { call, isLoading } = useCall(id);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!call) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Call not found</p>
      </div>
    );
  }

  const diarization = call.diarization;
  const segments = diarization?.segments ?? [];

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <FileAudio className="w-5 h-5" />
              {call.originalName}
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {formatFileSize(call.fileSize)} · Uploaded {new Date(call.uploadedAt).toLocaleString()}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              call.status === "completed"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : call.status === "failed"
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            }`}
          >
            {call.status}
          </span>
        </div>

        {/* Audio Player */}
        <div className="mb-6">
          <AudioPlayer callId={call.id} fileName={call.originalName} />
        </div>

        {/* Summary Card */}
        {call.summary && (
          <Card className="p-5 mb-6">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Call Summary
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {call.summary}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Emotional Arc (full width) */}
        {call.emotion && call.emotion.points.length > 0 && (
          <div className="mb-6">
            <EmotionChart emotion={call.emotion} />
          </div>
        )}

        {/* Two-column layout: Scorecard + Chat */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Scorecard */}
          <div>
            {call.scorecard && <ScorecardView scorecard={call.scorecard} />}
          </div>

          {/* Right: Chat Transcript */}
          <div>
            {segments.length > 0 && (
              <Card className="p-6">
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4 flex items-center gap-4">
                  <span>Conversation</span>
                  <span className="text-xs font-normal text-zinc-400">
                    {segments.length} segments
                  </span>
                </h2>

                {/* Speaker legend */}
                <div className="flex items-center gap-4 mb-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Headset className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-xs text-zinc-500">Agent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <User className="w-3 h-3 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-xs text-zinc-500">Customer</span>
                  </div>
                </div>

                {/* Chat messages */}
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {segments.map((segment, i) => (
                    <ChatBubble key={i} segment={segment} />
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Processing state */}
        {call.status !== "completed" && call.status !== "failed" && (
          <Card className="p-6 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-sm text-zinc-500">
              {call.status === "transcribing" && "Transcribing audio…"}
              {call.status === "analysing" && "Analysing conversation…"}
              {call.status === "uploaded" && "Queued for processing…"}
            </span>
          </Card>
        )}
      </div>
    </div>
  );
}
