"use client";

import { Card } from "@/components/ui/card";
import { AlertTriangle, Award } from "lucide-react";
import type { Scorecard, ScoreDimension } from "@/lib/api";

const DIMENSION_LABELS: { key: keyof Scorecard; label: string }[] = [
  { key: "greeting", label: "Greeting" },
  { key: "communication", label: "Communication" },
  { key: "empathy", label: "Empathy" },
  { key: "processAdherence", label: "Process Adherence" },
  { key: "resolutionQuality", label: "Resolution Quality" },
  { key: "closing", label: "Closing" },
];

function scoreColor(score: number): string {
  if (score >= 8) return "text-green-600 dark:text-green-400";
  if (score >= 5) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function barColor(score: number): string {
  if (score >= 8) return "bg-green-500";
  if (score >= 5) return "bg-yellow-500";
  return "bg-red-500";
}

function overallRingColor(score: number): string {
  if (score >= 8) return "stroke-green-500";
  if (score >= 5) return "stroke-yellow-500";
  return "stroke-red-500";
}

function DimensionRow({ label, dim }: { label: string; dim: ScoreDimension }) {
  return (
    <div className="py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </span>
        <span className={`text-sm font-semibold ${scoreColor(dim.score)}`}>
          {dim.score}/10
        </span>
      </div>
      <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-1.5">
        <div
          className={`h-full rounded-full transition-all ${barColor(dim.score)}`}
          style={{ width: `${dim.score * 10}%` }}
        />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        {dim.reason}
      </p>
    </div>
  );
}

function OverallRing({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 10) * circumference;

  return (
    <div className="relative w-28 h-28">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="stroke-zinc-100 dark:stroke-zinc-800"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className={overallRingColor(score)}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${scoreColor(score)}`}>
          {score.toFixed(1)}
        </span>
        <span className="text-xs text-zinc-400">/ 10</span>
      </div>
    </div>
  );
}

export function ScorecardView({ scorecard }: { scorecard: Scorecard }) {
  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4 flex items-center gap-2">
        <Award className="w-4 h-4 text-blue-500" />
        Agent Scorecard
      </h2>

      {/* Overall score */}
      <div className="flex items-center gap-6 mb-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <OverallRing score={scorecard.overall} />
        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Overall Performance
          </p>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs">
            Weighted average across all six evaluation dimensions. Resolution
            and empathy carry the most weight.
          </p>
        </div>
      </div>

      {/* Dimensions */}
      <div className="mb-4">
        {DIMENSION_LABELS.map(({ key, label }) => (
          <DimensionRow
            key={key}
            label={label}
            dim={scorecard[key] as ScoreDimension}
          />
        ))}
      </div>

      {/* Flags */}
      {scorecard.flags.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium text-red-700 dark:text-red-400">
              Flags ({scorecard.flags.length})
            </span>
          </div>
          <ul className="space-y-1">
            {scorecard.flags.map((flag, i) => (
              <li
                key={i}
                className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5"
              >
                <span className="mt-1">•</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
