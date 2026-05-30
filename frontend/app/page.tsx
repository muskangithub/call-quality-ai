"use client";

import { useCalls } from "@/lib/hooks";
import { UploadDialog } from "@/components/UploadDialog";
import { SemanticSearch } from "@/components/SemanticSearch";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  FileAudio,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import type { CallListItem } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: CallListItem["status"] }) {
  const config: Record<
    CallListItem["status"],
    { label: string; icon: typeof Clock; className: string }
  > = {
    uploaded: {
      label: "Queued",
      icon: Clock,
      className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    },
    transcribing: {
      label: "Transcribing",
      icon: Loader2,
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    },
    analysing: {
      label: "Analysing",
      icon: Loader2,
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    },
    completed: {
      label: "Completed",
      icon: CheckCircle2,
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    },
    failed: {
      label: "Failed",
      icon: XCircle,
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    },
  };

  const { label, icon: Icon, className } = config[status];
  const spinning = status === "transcribing" || status === "analysing";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${className}`}
    >
      <Icon className={`w-3 h-3 ${spinning ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  }

  const color =
    score >= 8
      ? "text-green-600 dark:text-green-400"
      : score >= 5
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-red-600 dark:text-red-400";

  return <span className={`font-semibold ${color}`}>{score.toFixed(1)}</span>;
}

function SentimentFlag({ call }: { call: CallListItem }) {
  // Flag = negative emotion events (escalations/mismatches) OR scorecard flags
  const negativeEvents = call.negativeEventCount ?? 0;
  const flagCount = call.flagCount ?? 0;
  const total = negativeEvents + flagCount;

  if (call.status !== "completed") {
    return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  }

  if (total === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Clean
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
      <AlertTriangle className="w-3.5 h-3.5" />
      {total} flag{total > 1 ? "s" : ""}
    </span>
  );
}

export default function Dashboard() {
  const { calls, isLoading, mutate } = useCalls();

  const completedCount = calls.filter((c) => c.status === "completed").length;
  const processingCount = calls.filter(
    (c) => c.status === "transcribing" || c.status === "analysing" || c.status === "uploaded"
  ).length;
  const avgScore =
    completedCount > 0
      ? calls
          .filter((c) => c.overallScore != null)
          .reduce((sum, c) => sum + (c.overallScore ?? 0), 0) / completedCount
      : null;

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Call Quality Dashboard
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              All analysed calls with scores, status and flags
            </p>
          </div>
          <UploadDialog onUploaded={() => mutate()} />
        </div>

        {/* Semantic search */}
        <SemanticSearch />

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-2">
                <FileAudio className="w-5 h-5 text-zinc-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {calls.length}
                </p>
                <p className="text-xs text-zinc-500">Total calls</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2">
                <Loader2 className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {processingCount}
                </p>
                <p className="text-xs text-zinc-500">Processing</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {avgScore !== null ? avgScore.toFixed(1) : "—"}
                </p>
                <p className="text-xs text-zinc-500">Avg score</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Calls table */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileAudio className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-zinc-500 dark:text-zinc-400">No calls yet</p>
              <p className="text-sm text-zinc-400 mt-1">
                Upload your first call recording to get started
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Call</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="w-24">Score</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-24">Flags</TableHead>
                  <TableHead className="w-32">Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow
                    key={call.id}
                    className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  >
                    <TableCell>
                      <Link
                        href={`/calls/${call.id}`}
                        className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <FileAudio className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                        <span className="truncate max-w-[160px]">
                          {call.originalName}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate max-w-[260px]">
                        {call.summary ?? (
                          <span className="text-zinc-300 dark:text-zinc-600">
                            {call.status === "completed" ? "—" : "Pending…"}
                          </span>
                        )}
                      </p>
                    </TableCell>
                    <TableCell>
                      <ScoreBadge score={call.overallScore} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={call.status} />
                    </TableCell>
                    <TableCell>
                      <SentimentFlag call={call} />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-zinc-500">
                        {formatDate(call.uploadedAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
