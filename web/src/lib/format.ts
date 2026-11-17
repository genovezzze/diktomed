/** 75.4 -> "1:15", 3725 -> "1:02:05". */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** Minutes of audio for summaries: 0.4 -> "< 1 min", 95 -> "1 h 35 min". */
export function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (seconds > 0 && minutes === 0) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const dateFmt = new Intl.DateTimeFormat("lv-LV", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Riga",
});

const dateTimeFmt = new Intl.DateTimeFormat("lv-LV", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Riga",
});

export function formatDateLV(date: Date | string): string {
  return dateFmt.format(typeof date === "string" ? new Date(date) : date);
}

export function formatDateTimeLV(date: Date | string): string {
  return dateTimeFmt.format(typeof date === "string" ? new Date(date) : date);
}
