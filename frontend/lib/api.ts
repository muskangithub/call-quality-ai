const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiarizedSegment {
  speaker: "Agent" | "Customer";
  text: string;
  start: number;
  end: number;
}

export interface DiarizationData {
  segments: DiarizedSegment[];
  formattedTranscript: string;
}

export interface ScoreDimension {
  score: number;
  reason: string;
}

export interface Scorecard {
  greeting: ScoreDimension;
  communication: ScoreDimension;
  empathy: ScoreDimension;
  processAdherence: ScoreDimension;
  resolutionQuality: ScoreDimension;
  closing: ScoreDimension;
  overall: number;
  flags: string[];
}

export interface EmotionPoint {
  windowIndex: number;
  startSec: number;
  endSec: number;
  timeLabel: string;
  agent: { score: number; label: string };
  customer: { score: number; label: string };
}

export interface EmotionEvent {
  type: "escalation" | "de-escalation" | "mismatch";
  windowIndex: number;
  timeLabel: string;
  description: string;
}

export interface EmotionTimeline {
  windowSizeSec: number;
  points: EmotionPoint[];
  events: EmotionEvent[];
  insight: string;
}

export interface CallRecord {
  id: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  durationSec: number | null;
  status: "uploaded" | "transcribing" | "analysing" | "completed" | "failed";
  errorMessage: string | null;
  transcript: unknown | null;
  diarization: DiarizationData | null;
  summary: string | null;
  scorecard: Scorecard | null;
  emotion: EmotionTimeline | null;
  uploadedAt: string;
  updatedAt: string;
}

export interface UploadResponse {
  id: string;
  filename: string;
  originalName: string;
  fileSize: number;
  status: string;
  message: string;
}

// Lightweight shape returned by the list endpoint (for the dashboard)
export interface CallListItem {
  id: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  durationSec: number | null;
  status: "uploaded" | "transcribing" | "analysing" | "completed" | "failed";
  errorMessage: string | null;
  summary: string | null;
  overallScore: number | null;
  eventCount: number;
  negativeEventCount: number;
  flagCount: number;
  uploadedAt: string;
  updatedAt: string;
}

// ─── Fetcher for SWR ──────────────────────────────────────────────────────────

export const fetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
};

// ─── SWR Key helpers ──────────────────────────────────────────────────────────

export const apiKeys = {
  calls: `${API_BASE}/calls`,
  call: (id: string) => `${API_BASE}/calls/${id}`,
};

export const audioUrl = (id: string): string => `${API_BASE}/calls/${id}/audio`;

// ─── Semantic search ──────────────────────────────────────────────────────────

export interface SearchResult {
  callId: string;
  originalName: string;
  summary: string | null;
  overallScore: number | null;
  uploadedAt: string;
  matchText: string;
  similarity: number;
}

export async function searchCalls(query: string): Promise<SearchResult[]> {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Search failed");
  }
  const data = (await res.json()) as { results: SearchResult[] };
  return data.results;
}

// ─── Upload (not SWR — this is a mutation) ────────────────────────────────────

export async function uploadCall(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/calls/upload`);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as UploadResponse);
      } else {
        const body = JSON.parse(xhr.responseText) as { error?: string };
        reject(new Error(body.error ?? `Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    const formData = new FormData();
    formData.append("audio", file);
    xhr.send(formData);
  });
}
