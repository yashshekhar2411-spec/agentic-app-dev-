export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function duration(startIso: string, endIso?: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const s = Math.max(0, Math.floor((end - new Date(startIso).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 75 -> "1m 15s", 3900 -> "1h 5m" */
export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
