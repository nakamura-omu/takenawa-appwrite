import { Player, ScenarioStep, StepDisplayConfig, TimelineSnapshot } from "@/types/room";

// メッセージ中のプレースホルダー置換
export function resolveMessage(template: string, player: Player, publishedTableNumber?: number): string {
  const tableNum = publishedTableNumber ?? player.tableNumber;
  return template
    .replace(/\{tableNumber\}/g, String(tableNum))
    .replace(/\{name\}/g, player.name);
}

// ステップタイプに応じたデフォルト表示
export function getDefaultDisplay(step: ScenarioStep): StepDisplayConfig {
  switch (step.type) {
    case "entry":
      return { message: "エントリー完了！" };
    case "break":
      return { message: "歓談タイムです" };
    case "end":
      return { message: "お疲れさまでした！" };
    case "survey":
      return { message: "アンケートに回答してください" };
    case "survey_result":
      return { message: "アンケート結果" };
    case "reveal":
      return { message: "回答開示" };
    case "participants":
      return { message: "テーブル一覧" };
    default:
      return { message: step.label };
  }
}

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
