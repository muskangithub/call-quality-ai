import useSWR from "swr";
import { fetcher, apiKeys, type CallRecord, type CallListItem } from "./api";

// ─── Fetch a single call with polling ─────────────────────────────────────────
// Polls every 3s while the call is still processing, stops once terminal state.

export function useCall(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<CallRecord>(
    id ? apiKeys.call(id) : null,
    fetcher,
    {
      refreshInterval: (latestData) => {
        // Stop polling once we reach a terminal state
        if (
          latestData?.status === "completed" ||
          latestData?.status === "failed"
        ) {
          return 0;
        }
        return 3000; // poll every 3s while processing
      },
    }
  );

  return { call: data, error, isLoading, mutate };
}

// ─── Fetch all calls ──────────────────────────────────────────────────────────

export function useCalls() {
  const { data, error, isLoading, mutate } = useSWR<{ calls: CallListItem[] }>(
    apiKeys.calls,
    fetcher,
    { refreshInterval: 10000 } // refresh list every 10s
  );

  return { calls: data?.calls ?? [], error, isLoading, mutate };
}
