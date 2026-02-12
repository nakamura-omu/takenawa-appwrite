import { ScenarioStep, StepType } from "@/types/room";

// 挿入・作成可能なステップタイプ一覧（entry / survey_result は特殊扱いのため除外）
export const INSERTABLE_STEP_TYPES: { value: StepType; label: string }[] = [
  { value: "table_game", label: "テーブルゲーム" },
  { value: "whole_game", label: "全体ゲーム" },
  { value: "break", label: "歓談" },
  { value: "participants", label: "参加者一覧" },
  { value: "survey", label: "アンケート集計" },
  { value: "survey_open", label: "アンケート回答依頼" },
  { value: "reveal", label: "回答開示" },
  { value: "result", label: "結果発表" },
  { value: "end", label: "閉会" },
];

// ステップタイプごとのデフォルトメッセージ
export function getDefaultMessage(step: ScenarioStep): string {
  switch (step.type) {
    case "entry": return "エントリー完了！";
    case "break": return "歓談タイムです";
    case "end": return "お疲れさまでした！";
    case "participants": return "テーブル一覧";
    case "reveal": return "回答開示";
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
    case "survey": return "アンケート集計";
    case "survey_open": return "アンケート回答依頼";
    case "survey_result": return "アンケート結果";
    case "participants": return "参加者一覧";
    case "reveal": return "回答開示";
    default: return type;
  }
}
