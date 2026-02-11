"use client";

import { Room, Player, ScenarioStep } from "@/types/room";
import EntryFieldsEditor from "./EntryFieldsEditor";

export interface StepDetailViewProps {
  roomId: string;
  step: ScenarioStep;
  room: Room;
  players: Record<string, Player> | null;
}

export default function StepDetailView({
  roomId,
  step,
  room,
  players,
}: StepDetailViewProps) {
  switch (step.type) {
    case "entry":
      return (
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">受付</h4>
            <div className="text-sm space-y-1">
              <p className="text-gray-400">
                参加者数: <span className="text-white font-semibold">{players ? Object.keys(players).length : 0}人</span>
              </p>
              <p className="text-gray-400">
                未割当: <span className="text-yellow-400 font-semibold">{players ? Object.values(players).filter((p) => p.tableNumber === 0).length : 0}人</span>
              </p>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-3">
            <EntryFieldsEditor
              roomId={roomId}
              fields={room.config.entryFields || []}
              compact
            />
          </div>
        </div>
      );
    case "table_game":
    case "whole_game":
      return (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">
            {step.type === "table_game" ? "テーブルゲーム" : "全体ゲーム"}
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p className="text-gray-400">
              ゲーム: <span className="text-white">{
                step.gameType === "value_match" ? "価値観マッチ"
                : step.gameType === "seno" ? "せーの！"
                : step.gameType === "streams" ? "ストリームス"
                : "未設定"
              }</span>
            </p>
            {step.config?.timeLimit && (
              <p className="text-gray-400">
                制限: <span className="text-white">{step.config.timeLimit}秒</span>
              </p>
            )}
          </div>
        </div>
      );
    case "break":
      return (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-1">歓談タイム</h4>
          <p className="text-xs text-gray-500">参加者は自由に歓談中です</p>
        </div>
      );
    case "result":
      return (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-1">結果発表</h4>
          <p className="text-xs text-gray-500">スコア集計・ランキング表示（将来実装）</p>
        </div>
      );
    case "end":
      return (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-1">閉会</h4>
          <p className="text-xs text-gray-500">参加者に閉会メッセージを表示します</p>
        </div>
      );
    case "survey":
      return (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">アンケート</h4>
          {step.survey && (
            <div className="text-sm space-y-1">
              <p className="text-gray-300 font-medium">{step.survey.question}</p>
              <div className="text-xs text-gray-500">
                選択肢: {step.survey.options.filter(o => o.trim()).join(" / ")}
              </div>
              {step.survey.allowMultiple && (
                <p className="text-xs text-blue-400">複数選択可</p>
              )}
            </div>
          )}
        </div>
      );
    case "survey_result":
      return (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-1">アンケート結果</h4>
          <p className="text-xs text-gray-500">
            {step.survey?.questionStepIndex !== undefined
              ? `Step ${step.survey.questionStepIndex + 1} の結果を表示`
              : "アンケート結果を表示します"
            }
          </p>
        </div>
      );
    default:
      return null;
  }
}
