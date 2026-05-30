"use client";

import { useRef, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Play, Pause, Volume2, RotateCcw } from "lucide-react";
import { audioUrl } from "@/lib/api";

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ callId, fileName }: { callId: string; fileName: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => setPlaying(false);
    const onErr = () => setError(true);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onErr);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onErr);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      void audio.play();
    }
    setPlaying(!playing);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const restart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Card className="p-4">
      <audio ref={audioRef} src={audioUrl(callId)} preload="metadata" />

      <div className="flex items-center gap-2 mb-3">
        <Volume2 className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
          {fileName}
        </span>
      </div>

      {error ? (
        <p className="text-xs text-red-500">Could not load audio file.</p>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-colors"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>

          <button
            onClick={restart}
            className="flex-shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            aria-label="Restart"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <span className="text-xs text-zinc-500 tabular-nums w-10 text-right">
            {formatTime(currentTime)}
          </span>

          <div className="relative flex-1 h-1.5">
            <div className="absolute inset-0 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
            <div
              className="absolute inset-y-0 left-0 bg-blue-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              aria-label="Seek"
            />
          </div>

          <span className="text-xs text-zinc-500 tabular-nums w-10">
            {formatTime(duration)}
          </span>
        </div>
      )}
    </Card>
  );
}
