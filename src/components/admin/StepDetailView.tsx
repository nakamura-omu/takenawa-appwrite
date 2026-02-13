"use client";

import { Room, Player, ScenarioStep, GameResult } from "@/types/room";
import { setRevealQuestionVisibility } from "@/lib/room";
import EntryFieldsEditor from "./EntryFieldsEditor";

export interface StepDetailViewProps {
  roomId: string;
  stepIndex: number;
  step: ScenarioStep;
  room: Room;
  players: Record<string, Player> | null;
}

export default function StepDetailView({
  roomId,
  stepIndex,
  step,
  room,
  players,
}: StepDetailViewProps) {
  // このステップへの回答データ
  const responses = room.stepResponses?.[String(stepIndex)];
  const responseEntries = responses ? Object.entries(responses) : [];

  const typeContent = (() => {
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
      case "whole_game": {
        const presetCount = (step.config?.questions || []).filter(q => q?.text?.trim()).length;
        return (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">
              {step.type === "table_game" ? "テーブルゲーム" : "全体ゲーム"}
            </h4>
            <div className="text-sm space-y-1">
              <p className="text-gray-400">
                ゲーム: <span className="text-white">{
                  step.gameType === "tuning_gum" ? "チューニングガム"
                  : step.gameType === "good_line" ? "いい線行きましょう"
                  : step.gameType === "evens" ? "みんなのイーブン"
                  : step.gameType === "krukkurin" ? "くるっくりん"
                  : step.gameType === "meta_streams" ? "メタストリームス"
                  : "未設定"
                }</span>
              </p>
              {presetCount > 0 && (
                <p className="text-gray-400">
                  お題: <span className="text-white">{presetCount}問設定済み</span>
                </p>
              )}
            </div>
          </div>
        );
      }
      case "break":
        return (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-1">歓談タイム</h4>
            <p className="text-xs text-gray-500">参加者は自由に歓談中です</p>
          </div>
        );
      case "end":
        return (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-1">閉会</h4>
            <p className="text-xs text-gray-500">参加者に閉会メッセージを表示します</p>
          </div>
        );
      case "survey": {
        // 選択肢ごとの集計
        const surveyCounts: Record<string, number> = {};
        if (step.survey) {
          step.survey.options.filter(o => o.trim()).forEach(o => { surveyCounts[o] = 0; });
        }
        responseEntries.forEach(([, r]) => {
          const val = String(r.value);
          // 複数選択の場合カンマ区切り
          val.split(",").forEach(v => {
            const trimmed = v.trim();
            if (trimmed) surveyCounts[trimmed] = (surveyCounts[trimmed] || 0) + 1;
          });
        });
        const totalPlayers = players ? Object.keys(players).length : 0;
        return (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">アンケート集計</h4>
            {step.survey && (
              <div className="text-sm space-y-2">
                <p className="text-gray-300 font-medium">{step.survey.question}</p>
                {step.survey.allowMultiple && (
                  <p className="text-xs text-blue-400">複数選択可</p>
                )}
                {/* 回答状況 */}
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">
                    回答: {responseEntries.length}/{totalPlayers}人
                  </p>
                  {Object.entries(surveyCounts).map(([option, count]) => (
                    <div key={option} className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-xs text-gray-300 min-w-0 truncate">{option}</span>
                        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: responseEntries.length > 0 ? `${(count / responseEntries.length) * 100}%` : "0%" }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums w-6 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }
      case "survey_open": {
        const totalPlayersOpen = players ? Object.keys(players).length : 0;
        return (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">アンケート回答依頼</h4>
            {step.survey && (
              <div className="text-sm space-y-2">
                <p className="text-gray-300 font-medium">{step.survey.question}</p>
                {/* 回答状況 */}
                <p className="text-xs text-gray-500">
                  回答: {responseEntries.length}/{totalPlayersOpen}人
                </p>
                {responseEntries.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {responseEntries
                      .sort((a, b) => a[1].submittedAt - b[1].submittedAt)
                      .map(([pid, r]) => (
                        <div key={pid} className="flex items-start gap-2 text-xs bg-gray-800 rounded px-2 py-1.5">
                          <span className="text-gray-400 shrink-0 font-medium">{r.playerName}</span>
                          <span className="text-gray-200 break-all">{String(r.value)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }
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
      case "reveal": {
        // per_question モード用のデータ取得
        const sourceIdx = step.reveal?.sourceStepIndex;
        const sourceStepDef = sourceIdx !== undefined ? room.scenario?.steps?.[sourceIdx] : undefined;
        const isSourceGame = sourceStepDef?.type === "table_game" || sourceStepDef?.type === "whole_game";
        const isSourceSurvey = sourceStepDef?.type === "survey_open" || sourceStepDef?.type === "survey";

        const rawGameResults = room.gameResults;
        let revealGameResult: GameResult | undefined;
        if (rawGameResults && sourceIdx !== undefined) {
          revealGameResult =
            rawGameResults[String(sourceIdx)]
            ?? (rawGameResults as unknown as GameResult[])?.[sourceIdx];
          if (revealGameResult && typeof revealGameResult !== "object") revealGameResult = undefined;
        }

        // survey_open / survey の回答データ
        const surveyResponses = sourceIdx !== undefined
          ? (room.stepResponses?.[String(sourceIdx)] ?? room.stepResponses?.[sourceIdx as unknown as string])
          : undefined;

        const visibilityMap = room.revealVisibility?.[String(stepIndex)] || {};

        // per_question 用のトグルアイテムリスト（ゲーム: questionId→text / アンケート: playerId→回答）
        type ToggleItem = { key: string; label: string; detail?: string };
        const toggleItems: ToggleItem[] = [];
        if (step.reveal?.displayType === "per_question") {
          if (isSourceGame && revealGameResult?.questions) {
            Object.entries(revealGameResult.questions).forEach(([qId, q]) => {
              const cnt = revealGameResult!.answers?.[qId] ? Object.keys(revealGameResult!.answers[qId]).length : 0;
              toggleItems.push({ key: qId, label: q.text, detail: `${cnt}件` });
            });
          } else if (isSourceSurvey && surveyResponses && typeof surveyResponses === "object") {
            Object.entries(surveyResponses)
              .sort((a, b) => a[1].submittedAt - b[1].submittedAt)
              .forEach(([pid, r]) => {
                toggleItems.push({ key: pid, label: r.playerName, detail: String(r.value) });
              });
          }
        }

        return (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-1">回答開示</h4>
            {step.reveal ? (
              <div className="text-sm space-y-1">
                <p className="text-gray-400">
                  参照: <span className="text-white">Step {step.reveal.sourceStepIndex + 1}
                    {sourceStepDef && (
                      <span className="text-gray-500 ml-1">({sourceStepDef.label})</span>
                    )}
                  </span>
                </p>
                <p className="text-gray-400">
                  表示: <span className="text-white">{
                    step.reveal.displayType === "list" ? "一覧"
                    : step.reveal.displayType === "bar_chart" ? "棒グラフ"
                    : step.reveal.displayType === "pie_chart" ? "円グラフ"
                    : step.reveal.displayType === "scoreboard" ? "スコアボード（ゲーム用）"
                    : step.reveal.displayType === "per_question" ? "個別お題開示"
                    : step.reveal.displayType
                  }</span>
                </p>
                <p className="text-gray-400">
                  範囲: <span className="text-white">{
                    !step.reveal.scope || step.reveal.scope.type === "all" ? "全体"
                    : step.reveal.scope.type === "table" ? "同じテーブル"
                    : "特定プレイヤー"
                  }</span>
                </p>
                {/* per_question モード: 個別トグル */}
                {step.reveal.displayType === "per_question" && toggleItems.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          for (const item of toggleItems) {
                            await setRevealQuestionVisibility(roomId, stepIndex, item.key, true);
                          }
                        }}
                        className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs font-semibold transition"
                      >
                        全表示
                      </button>
                      <button
                        onClick={async () => {
                          for (const item of toggleItems) {
                            await setRevealQuestionVisibility(roomId, stepIndex, item.key, false);
                          }
                        }}
                        className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs font-semibold transition"
                      >
                        全非表示
                      </button>
                    </div>
                    {toggleItems.map((item) => {
                      const isVisible = visibilityMap[item.key] === true;
                      return (
                        <div
                          key={item.key}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded border ${
                            isVisible
                              ? "bg-green-900/20 border-green-700/50"
                              : "bg-gray-800/50 border-gray-700"
                          }`}
                        >
                          <button
                            onClick={() => setRevealQuestionVisibility(roomId, stepIndex, item.key, !isVisible)}
                            className={`shrink-0 w-8 h-5 rounded-full relative transition-colors ${
                              isVisible ? "bg-green-600" : "bg-gray-600"
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                isVisible ? "left-3.5" : "left-0.5"
                              }`}
                            />
                          </button>
                          <span className="text-xs text-gray-200 flex-1 truncate">{item.label}</span>
                          {item.detail && (
                            <span className="text-xs text-gray-500 shrink-0 max-w-[120px] truncate">{item.detail}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500">未設定</p>
            )}
          </div>
        );
      }
      case "participants":
        return (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-1">参加者一覧</h4>
            <p className="text-xs text-gray-500">テーブルごとの参加者一覧を表示します</p>
            {room.publishedTables ? (
              <p className="text-xs text-blue-400 mt-1">
                最終プッシュ: {new Date(room.publishedTables.pushedAt).toLocaleTimeString("ja-JP")}
              </p>
            ) : (
              <p className="text-xs text-yellow-400 mt-1">テーブル情報が未プッシュです</p>
            )}
          </div>
        );
      default:
        return null;
    }
  })();

  // 共通プロパティ（メッセージ、所要時間など）
  const hasMessage = !!step.display?.message;
  const hasDuration = !!step.durationMinutes;
  const hasCommon = hasMessage || hasDuration;

  return (
    <div className="space-y-3">
      {typeContent}
      {hasCommon && (
        <div className="border-t border-gray-700 pt-2 space-y-1.5">
          {hasMessage && (
            <div>
              <span className="text-xs text-gray-500">メッセージ: </span>
              <span className="text-xs text-gray-300 whitespace-pre-wrap">{step.display!.message}</span>
            </div>
          )}
          {hasDuration && (
            <div>
              <span className="text-xs text-gray-500">予定時間: </span>
              <span className="text-xs text-gray-300">{step.durationMinutes}分</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
