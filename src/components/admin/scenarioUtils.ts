import { ScenarioStep, StepType } from "@/types/room";

// ステップタイプごとのデフォルトメッセージ
export function getDefaultMessage(step: ScenarioStep): string {
  switch (step.type) {
    case "entry": return "エントリー完了！";
    case "break": return "歓談タイムです";
    case "end": return "お疲れさまでした！";
    default: return step.label;
  }
}

// ステップタイプの日本語ラベル
export function stepTypeLabel(type: StepType): string {
  switch (type) {
    case "entry": return "受付";
    case "table_game": return "テーブルゲーム";
    case "whole_game": return "全体ゲーム";
    case "break": return "歓談";
    case "result": return "結果発表";
    case "end": return "閉会";
    case "survey": return "アンケート";
    case "survey_result": return "アンケート結果";
    default: return type;
  }
}
