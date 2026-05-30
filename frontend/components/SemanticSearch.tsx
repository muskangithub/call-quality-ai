"use client";

import { useState } from "react";
import { Search, Loader2, Sparkles, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchCalls, type SearchResult } from "@/lib/api";
import Link from "next/link";

const EXAMPLE_QUERIES = [
  "customer frustrated about a refund that wasn't resolved",
  "agent was rude or dismissive",
  "billing or payment problem",
];

function scoreColor(score: number | null): string {
  if (score === null) return "text-zinc-400";
  if (score >= 8) return "text-green-600 dark:text-green-400";
  if (score >= 5) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function SemanticSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await searchCalls(q);
      setResults(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(query);
  };

  const clear = () => {
    setQuery("");
    setResults(null);
    setError(null);
  };

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-blue-500" />
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Semantic Search
        </h2>
        <span className="text-xs text-zinc-400">— search by meaning, not keywords</span>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. customer angry about a refund they never received"
            className="pl-9"
          />
          {query && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
        </Button>
      </form>

      {/* Example queries */}
      {results === null && !loading && (
        <div className="flex flex-wrap gap-2 mt-3">
          {EXAMPLE_QUERIES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setQuery(ex);
                void runSearch(ex);
              }}
              className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

      {/* Results */}
      {results !== null && (
        <div className="mt-4">
          {results.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">
              No matching calls found.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400 mb-2">
                {results.length} result{results.length > 1 ? "s" : ""} ranked by relevance
              </p>
              {results.map((r) => (
                <Link
                  key={r.callId}
                  href={`/calls/${r.callId}`}
                  className="block rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {r.originalName}
                    </span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {r.overallScore !== null && (
                        <span className={`text-xs font-semibold ${scoreColor(r.overallScore)}`}>
                          {r.overallScore.toFixed(1)}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        {(r.similarity * 100).toFixed(0)}% match
                      </span>
                    </div>
                  </div>
                  {/* The matched chunk — shows WHY this call surfaced */}
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 italic line-clamp-2">
                    “…{r.matchText.replace(/\n/g, " ")}…”
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
