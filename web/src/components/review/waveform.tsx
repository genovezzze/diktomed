"use client";

import { useEffect, useRef, type RefObject } from "react";
import { SEVERITY_HEX, type FlagView } from "./types";

const BAR = 3;
const GAP = 2;

/** Peaks (0..1) of decoded audio, `count` buckets, by max absolute amplitude. */
export function computePeaks(samples: Float32Array, count: number): number[] {
  const peaks = new Array<number>(count).fill(0);
  const size = Math.max(1, Math.floor(samples.length / count));
  let max = 0;
  for (let i = 0; i < count; i++) {
    let peak = 0;
    const from = i * size;
    const to = Math.min(samples.length, from + size);
    for (let j = from; j < to; j++) {
      const v = Math.abs(samples[j]);
      if (v > peak) peak = v;
    }
    peaks[i] = peak;
    if (peak > max) max = peak;
  }
  return max > 0 ? peaks.map((p) => p / max) : peaks;
}

interface WaveformProps {
  audioRef: RefObject<HTMLAudioElement>;
  peaks: number[] | null;
  duration: number;
  flags: FlagView[];
  onSeek: (seconds: number) => void;
}

/**
 * Canvas waveform. It reads the playhead from the <audio> element on every
 * animation frame, so playback stays smooth without re-rendering React.
 */
export function Waveform({ audioRef, peaks, duration, flags, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let frame = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (ctx && width > 0) {
        ctx.clearRect(0, 0, width, height);
        const base = getComputedStyle(canvas).color;
        const t = audioRef.current?.currentTime ?? 0;
        const progressX = duration > 0 ? (t / duration) * width : 0;
        const bars = Math.max(1, Math.floor(width / (BAR + GAP)));
        const mid = height / 2;

        for (let i = 0; i < bars; i++) {
          let v = 0.06;
          if (peaks && peaks.length) {
            const from = Math.floor((i / bars) * peaks.length);
            const to = Math.max(from + 1, Math.floor(((i + 1) / bars) * peaks.length));
            for (let j = from; j < to; j++) v = Math.max(v, peaks[j]);
          }
          const x = i * (BAR + GAP);
          const h = Math.max(2, v * (height - 8));
          ctx.fillStyle = x + BAR <= progressX ? "#0A84FF" : base;
          ctx.globalAlpha = x + BAR <= progressX ? 1 : 0.32;
          ctx.beginPath();
          ctx.roundRect(x, mid - h / 2, BAR, h, 1.5);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Open flags as small ticks along the bottom edge.
        for (const f of flags) {
          if (f.status !== "OPEN" || duration <= 0) continue;
          const x = (f.start / duration) * width;
          ctx.fillStyle = SEVERITY_HEX[f.severity];
          ctx.fillRect(Math.max(0, x - 1), height - 4, 3, 4);
        }

        ctx.fillStyle = "#0A84FF";
        ctx.fillRect(Math.min(width - 2, progressX), 0, 2, height);
      }
      frame = requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [audioRef, peaks, duration, flags]);

  return (
    <div
      ref={wrapRef}
      className="relative h-20 w-full cursor-pointer select-none"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (duration > 0) onSeek(((e.clientX - rect.left) / rect.width) * duration);
      }}
      role="slider"
      aria-label="Atskaņošanas pozīcija"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(audioRef.current?.currentTime ?? 0)}
      tabIndex={0}
      onKeyDown={(e) => {
        const a = audioRef.current;
        if (!a) return;
        if (e.key === "ArrowRight") onSeek(Math.min(duration, a.currentTime + 5));
        if (e.key === "ArrowLeft") onSeek(Math.max(0, a.currentTime - 5));
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 text-foreground" />
    </div>
  );
}
