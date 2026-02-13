import { TimelineSnapshot } from "@/types/room";

// スナップショットの読み書き
export function loadSnapshots(roomId: string, playerId: string): Record<number, TimelineSnapshot> {
  try {
    const raw = localStorage.getItem(`timeline_${roomId}_${playerId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSnapshots(roomId: string, playerId: string, snapshots: Record<number, TimelineSnapshot>) {
  localStorage.setItem(`timeline_${roomId}_${playerId}`, JSON.stringify(snapshots));
}
