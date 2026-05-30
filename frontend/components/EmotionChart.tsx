"use client";

import { Card } from "@/components/ui/card";
import { Activity, Lightbulb, TrendingDown, TrendingUp, GitCompareArrows } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import type { EmotionTimeline, EmotionPoint, EmotionEvent } from "@/lib/api";

// Map a -5..+5 score to a descriptive band for the Y axis
function scoreToZone(score: number): string {
  if (score >= 3) return "Positive";
  if (score >= 1) return "Mild+";
  if (score > -1) return "Neutral";
  if (score > -3) return "Negative";
  return "Angry";
}

const EVENT_STYLES: Record<
  EmotionEvent["type"],
  { color: string; bg: string; text: string; icon: typeof TrendingDown; label: string }
> = {
  escalation: {
    color: "#ef4444",
    bg: "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30",
    text: "text-red-700 dark:text-red-400",
    icon: TrendingDown,
    label: "Escalation",
  },
  "de-escalation": {
    color: "#22c55e",
    bg: "bg-green-50 dark:bg-green-950/20 border-green-100 dark:border-green-900/30",
    text: "text-green-700 dark:text-green-400",
    icon: TrendingUp,
    label: "De-escalation",
  },
  mismatch: {
    color: "#f59e0b",
    bg: "bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30",
    text: "text-amber-700 dark:text-amber-400",
    icon: GitCompareArrows,
    label: "Mismatch",
  },
};

interface ChartRow {
  time: string;
  windowIndex: number;
  agentScore: number;
  customerScore: number;
  agentLabel: string;
  customerLabel: string;
}

interface TooltipPayloadItem {
  payload: ChartRow;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-2">
        Time {row.time}
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Agent
          </span>
          <span className="font-medium">
            {row.agentLabel} ({row.agentScore > 0 ? "+" : ""}
            {row.agentScore})
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Customer
          </span>
          <span className="font-medium">
            {row.customerLabel} ({row.customerScore > 0 ? "+" : ""}
            {row.customerScore})
          </span>
        </div>
      </div>
    </div>
  );
}

export function EmotionChart({ emotion }: { emotion: EmotionTimeline }) {
  const data: ChartRow[] = emotion.points.map((p: EmotionPoint) => ({
    time: p.timeLabel,
    windowIndex: p.windowIndex,
    agentScore: p.agent.score,
    customerScore: p.customer.score,
    agentLabel: p.agent.label,
    customerLabel: p.customer.label,
  }));

  const events = emotion.events ?? [];

  // Helper to find the customer score at an event's window (for dot placement)
  const pointForWindow = (windowIndex: number): EmotionPoint | undefined =>
    emotion.points.find((p) => p.windowIndex === windowIndex);

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-2">
        <Activity className="w-4 h-4 text-blue-500" />
        Emotional Arc
      </h2>
      <p className="text-xs text-zinc-400 mb-4">
        Agent vs customer emotion across the call, with escalations,
        de-escalations and mismatch moments marked
      </p>

      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} className="text-zinc-500" />
            <YAxis
              domain={[-5, 5]}
              ticks={[-5, -3, 0, 3, 5]}
              tickFormatter={(v: number) => scoreToZone(v)}
              tick={{ fontSize: 10 }}
              width={70}
              className="text-zinc-500"
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#a1a1aa" strokeDasharray="2 2" />

            {/* Event markers — vertical lines + dots on the customer line */}
            {events.map((ev, i) => {
              const style = EVENT_STYLES[ev.type];
              return (
                <ReferenceLine
                  key={`line-${i}`}
                  x={ev.timeLabel}
                  stroke={style.color}
                  strokeDasharray="4 3"
                  strokeOpacity={0.5}
                />
              );
            })}
            {events.map((ev, i) => {
              const pt = pointForWindow(ev.windowIndex);
              if (!pt) return null;
              const style = EVENT_STYLES[ev.type];
              return (
                <ReferenceDot
                  key={`dot-${i}`}
                  x={ev.timeLabel}
                  y={pt.customer.score}
                  r={5}
                  fill={style.color}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              );
            })}

            <Line
              type="monotone"
              dataKey="agentScore"
              name="Agent"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="customerScore"
              name="Customer"
              stroke="#22c55e"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-3 justify-center flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-blue-500" />
          <span className="text-xs text-zinc-500">Agent</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-green-500" />
          <span className="text-xs text-zinc-500">Customer</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-zinc-500">Escalation</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-zinc-500">De-escalation</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-xs text-zinc-500">Mismatch</span>
        </div>
      </div>

      {/* Event list */}
      {events.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
            Key Moments
          </h3>
          {events.map((ev, i) => {
            const style = EVENT_STYLES[ev.type];
            const Icon = style.icon;
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-lg border p-2.5 ${style.bg}`}
              >
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${style.text}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${style.text}`}>
                      {style.label}
                    </span>
                    <span className="text-xs text-zinc-400">@ {ev.timeLabel}</span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                    {ev.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Insight */}
      {emotion.insight && (
        <div className="mt-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-lg p-3 flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            {emotion.insight}
          </p>
        </div>
      )}
    </Card>
  );
}
