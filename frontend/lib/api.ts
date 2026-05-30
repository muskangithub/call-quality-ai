const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CallRecord {
  id: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  durationSec: number | null;
  status: "uploaded" | "transcribing" | "analysing" | "completed" | "failed";
  errorMessage: string | null;
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
