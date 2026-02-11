"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getRoom, addPlayer, subscribeToPlayer, subscribeToRoom, subscribeToPlayers, subscribeToMessages, registerPresence } from "@/lib/room";
import { ensureAnonymousUser } from "@/lib/firebase";
import { Room, Player, EntryField, ScenarioStep, TimelineSnapshot, AdminMessage } from "@/types/room";
import { loadSnapshots, saveSnapshots } from "@/lib/timeline";
import { TimelineCard } from "./TimelineCard";
import { MessageCard } from "./MessageCard";
import { SurveyInput } from "./SurveyInput";
import { SurveyResults } from "./SurveyResults";
import { GameQuestion } from "./GameQuestion";
import { MissingFieldsForm } from "./MissingFieldsForm";

// 参加者エントリーフォーム + タイムライン
export function EntryForm({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string | number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerData, setPlayerData] = useState<Player | null>(null);
  const [allPlayers, setAllPlayers] = useState<Record<string, Player> | null>(null);
  const [messages, setMessages] = useState<Record<string, AdminMessage> | null>(null);
  const [snapshots, setSnapshots] = useState<Record<number, TimelineSnapshot>>({});
  const timelineEndRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef<number>(0);

  // ルーム情報の取得 + 既存プレイヤーIDの復元
  useEffect(() => {
    (async () => {
      try {
        // 匿名ログイン（セキュリティルールで auth != null が必要）
        try { await ensureAnonymousUser(); } catch { /* Auth未有効でも続行 */ }
        const data = await getRoom(roomId);
        if (data) {
          setRoom(data);
          const initial: Record<string, string | number> = {};
          (data.config.entryFields || []).forEach((field) => {
            initial[field.id] = "";
          });
          setFormValues(initial);

          // localStorageから既存のplayerIdを復元
          const storedId = localStorage.getItem(`player_${roomId}`);
          if (storedId) {
            setPlayerId(storedId);
            // スナップショットも復元
            setSnapshots(loadSnapshots(roomId, storedId));
          }
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [roomId]);

  // 自分のプレイヤーデータをリアルタイム購読 + プレゼンス登録
  useEffect(() => {
    if (!playerId) return;
    const unsubPlayer = subscribeToPlayer(roomId, playerId, (data) => {
      if (data) {
        setPlayerData(data);
      } else {
        localStorage.removeItem(`player_${roomId}`);
        setPlayerId(null);
        setPlayerData(null);
      }
    });
    const unsubPresence = registerPresence(roomId, playerId);
    return () => {
      unsubPlayer();
      unsubPresence();
    };
  }, [roomId, playerId]);

  // ルーム全体をリアルタイム購読（ステップ進行を検知）
  useEffect(() => {
    if (!playerId) return;
    const unsub = subscribeToRoom(roomId, (data) => {
      if (data) setRoom(data);
    });
    return unsub;
  }, [roomId, playerId]);

  // プレイヤー一覧をリアルタイム購読（テーブルメイト情報）
  useEffect(() => {
    if (!playerId) return;
    const unsub = subscribeToPlayers(roomId, (players) => {
      setAllPlayers(players);
    });
    return unsub;
  }, [roomId, playerId]);

  // 管理者メッセージを購読
  useEffect(() => {
    if (!playerId) return;
    const unsub = subscribeToMessages(roomId, setMessages);
    return unsub;
  }, [roomId, playerId]);

  // スナップショットをキャプチャする関数
  const buildSnapshot = useCallback((): TimelineSnapshot => {
    const tableNum = playerData?.tableNumber ?? 0;
    const tablemates: string[] = [];
    if (tableNum > 0 && allPlayers && playerId) {
      Object.entries(allPlayers).forEach(([pid, p]) => {
        if (pid !== playerId && p.tableNumber === tableNum) {
          tablemates.push(p.name);
        }
      });
    }
    return { tableNumber: tableNum, tablemates, capturedAt: Date.now() };
  }, [playerData, allPlayers, playerId]);

  // スナップショット更新:
  // - 過去のステップ（0..currentStep-1）: スナップショットがなければ現在データでキャプチャ（リロード対応）
  // - 現在のステップ: キャプチャしない（ライブデータを使う）
  // - ステップが進んだ瞬間: 直前のステップをキャプチャして凍結
  useEffect(() => {
    if (!room || !playerData || !playerId || !allPlayers) return;

    const currentStep = room.state.currentStep;
    const steps = room.scenario?.steps || [];
    let updated = false;
    const newSnapshots = { ...snapshots };

    // 過去のステップでスナップショットがないものをキャプチャ（リロード時のフォールバック）
    for (let i = 0; i < currentStep; i++) {
      if (newSnapshots[i]) continue;

      const snap = buildSnapshot();
      // フィールド値
      const showFields = steps[i]?.display?.showFields;
      if (showFields && showFields.length > 0 && playerData.fields) {
        snap.fieldValues = {};
        showFields.forEach((fid) => {
          if (playerData.fields[fid] !== undefined) {
            snap.fieldValues![fid] = playerData.fields[fid];
          }
        });
      }
      newSnapshots[i] = snap;
      updated = true;
    }

    if (updated) {
      setSnapshots(newSnapshots);
      saveSnapshots(roomId, playerId, newSnapshots);
    }
  }, [room?.state.currentStep, playerData, allPlayers, playerId, roomId, snapshots, buildSnapshot, room]);

  // ステップ遷移検知: 前のステップを凍結キャプチャ
  useEffect(() => {
    if (!room || !playerData || !playerId || !allPlayers) return;

    const currentStep = room.state.currentStep;
    const prev = prevStepRef.current;

    if (currentStep > prev) {
      const steps = room.scenario?.steps || [];
      const newSnapshots = { ...snapshots };
      let updated = false;

      // prev..currentStep-1 のステップをキャプチャ（飛ばしがあっても対応）
      for (let i = prev; i < currentStep; i++) {
        const snap = buildSnapshot();
        const showFields = steps[i]?.display?.showFields;
        if (showFields && showFields.length > 0 && playerData.fields) {
          snap.fieldValues = {};
          showFields.forEach((fid) => {
            if (playerData.fields[fid] !== undefined) {
              snap.fieldValues![fid] = playerData.fields[fid];
            }
          });
        }
        newSnapshots[i] = snap; // 上書きして最新状態で凍結
        updated = true;
      }

      if (updated) {
        setSnapshots(newSnapshots);
        saveSnapshots(roomId, playerId, newSnapshots);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.state.currentStep]);

  // 自動スクロール: ステップが進んだら最下部へ
  useEffect(() => {
    const currentStep = room?.state.currentStep ?? 0;
    if (currentStep > prevStepRef.current) {
      setTimeout(() => {
        timelineEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
    prevStepRef.current = currentStep;
  }, [room?.state.currentStep]);

  const DEFAULT_ENTRY_FIELDS: EntryField[] = [
    { id: "name", label: "名前", type: "text", required: true },
  ];
  const entryFields: EntryField[] =
    room?.config.entryFields?.length ? room.config.entryFields : DEFAULT_ENTRY_FIELDS;

  // エントリー項目はすべて入力必須
  const isValid = entryFields.every((field) => {
    const val = formValues[field.id];
    return val !== undefined && val !== "";
  });

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const nameField = entryFields.find((f) => f.id === "name");
      const name = nameField ? String(formValues["name"] || "") : String(formValues[entryFields[0]?.id] || "参加者");

      const fields: Record<string, string | number> = {};
      entryFields.forEach((field) => {
        const val = formValues[field.id];
        fields[field.id] = field.type === "number" ? Number(val) || 0 : String(val || "");
      });

      const id = await addPlayer(roomId, {
        name,
        tableNumber: 0,
        fields,
      });
      localStorage.setItem(`player_${roomId}`, id);
      setPlayerId(id);
    } catch (error) {
      console.error("エントリーエラー:", error);
      alert("送信に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </main>
    );
  }

  if (notFound || !room) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8">
        <h1 className="text-2xl font-bold mb-4">ルームが見つかりません</h1>
        <p className="text-gray-400 mb-6">
          ルームID「{roomId}」は存在しないか、削除されています。
        </p>
        <a
          href="/"
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition"
        >
          トップへ戻る
        </a>
      </main>
    );
  }

  // エントリー完了後：タイムライン表示
  if (playerId && playerData) {
    const steps = room.scenario?.steps || [];
    const currentStep = room.state.currentStep;

    // メッセージをターゲットでフィルタ
    const filteredMessages: AdminMessage[] = messages
      ? Object.values(messages).filter((msg) => {
          if (msg.target.type === "all") return true;
          if (msg.target.type === "table" && msg.target.tableNumber === playerData.tableNumber) return true;
          if (msg.target.type === "player" && msg.target.playerId === playerId) return true;
          return false;
        })
      : [];

    // ステップカードとメッセージを時系列で統合
    type TimelineItem =
      | { kind: "step"; index: number; step: ScenarioStep }
      | { kind: "message"; message: AdminMessage };

    const timelineItems: TimelineItem[] = [];
    for (let idx = 0; idx <= currentStep; idx++) {
      timelineItems.push({ kind: "step", index: idx, step: steps[idx] });
      // このステップ中に送信されたメッセージを挿入
      const stepMessages = filteredMessages
        .filter((m) => m.sentDuringStep === idx)
        .sort((a, b) => a.sentAt - b.sentAt);
      for (const msg of stepMessages) {
        timelineItems.push({ kind: "message", message: msg });
      }
    }

    return (
      <main className="min-h-screen flex flex-col p-4">
        <div className="w-full max-w-md mx-auto">
          {/* ヘッダー（固定表示） */}
          <div className="text-center mb-4 sticky top-0 bg-gray-950/90 backdrop-blur py-3 z-10">
            <h1 className="text-lg font-bold">{room.config.eventName}</h1>
            <p className="text-gray-400 text-xs">{room.config.eventDate}</p>
          </div>

          {/* タイムライン */}
          <div className="pb-8">
            {timelineItems.map((item, i) => {
              if (item.kind === "message") {
                return <MessageCard key={`msg-${item.message.id}`} message={item.message} senderName={room.config.adminName} />;
              }
              const idx = item.index;
              return (
                <div key={`step-${idx}`}>
                  <TimelineCard
                    stepIndex={idx}
                    step={item.step}
                    player={playerData}
                    snapshot={snapshots[idx]}
                    prevSnapshot={idx > 0 ? snapshots[idx - 1] : undefined}
                    isCurrent={idx === currentStep}
                    entryFields={entryFields}
                    allPlayers={allPlayers}
                    playerId={playerId}
                  />
                  {/* 追加エントリー項目（entryタイプ＆現在ステップ） */}
                  {item.step.type === "entry" && idx === currentStep && (
                    <div className="relative pl-6 pb-2 -mt-4">
                      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                      <MissingFieldsForm
                        roomId={roomId}
                        playerId={playerId}
                        player={playerData}
                        entryFields={entryFields}
                      />
                    </div>
                  )}
                  {/* アンケート入力（現在ステップ＆surveyタイプ） */}
                  {item.step.type === "survey" && item.step.survey && idx === currentStep && (
                    <div className="relative pl-6 pb-2 -mt-4">
                      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                      <SurveyInput
                        roomId={roomId}
                        stepIndex={idx}
                        step={item.step}
                        playerId={playerId}
                        playerName={playerData.name}
                        tableNumber={playerData.tableNumber}
                        existingResponse={room.stepResponses?.[String(idx)]?.[playerId]}
                      />
                    </div>
                  )}
                  {/* アンケート結果表示（survey_resultタイプ） */}
                  {item.step.type === "survey_result" && item.step.survey?.questionStepIndex !== undefined && (
                    <div className="relative pl-6 pb-2 -mt-4">
                      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                      <SurveyResults
                        room={room}
                        questionStepIndex={item.step.survey.questionStepIndex}
                        playerTableNumber={playerData.tableNumber}
                        playerId={playerId}
                      />
                    </div>
                  )}
                  {/* ゲームのお題・回答（現在ステップ＆ゲーム系＆お題あり） */}
                  {(item.step.type === "table_game" || item.step.type === "whole_game") &&
                    idx === currentStep &&
                    room.currentGame?.questions && Object.keys(room.currentGame.questions).length > 0 && (
                    <div className="relative pl-6 pb-2 -mt-4">
                      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                      <GameQuestion
                        roomId={roomId}
                        room={room}
                        playerId={playerId}
                        playerName={playerData.name}
                        tableNumber={playerData.tableNumber}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={timelineEndRef} />
          </div>
        </div>
      </main>
    );
  }

  // エントリーフォーム
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">{room.config.eventName}</h1>
          <p className="text-gray-400 text-sm">{room.config.eventDate}</p>
          <p className="text-gray-500 text-xs mt-1">ルームID: {roomId}</p>
        </div>

        <section className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">参加者エントリー</h2>

          <div className="space-y-4">
            {entryFields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm text-gray-400 mb-1">
                  {field.label}
                  <span className="text-red-400 ml-1">*</span>
                </label>

                {field.type === "select" ? (
                  <select
                    value={String(formValues[field.id] || "")}
                    onChange={(e) => setFormValues({ ...formValues, [field.id]: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                  >
                    <option value="">選択してください</option>
                    {(field.options || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    value={String(formValues[field.id] ?? "")}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        [field.id]: e.target.value,
                      })
                    }
                    placeholder={field.label}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                  />
                )}
              </div>
            ))}

            <button
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-semibold transition"
            >
              {submitting ? "送信中..." : "参加する"}
            </button>
          </div>
        </section>

        <a
          href="/"
          className="block text-center text-sm text-gray-500 hover:text-gray-300 mt-4"
        >
          ← トップへ戻る
        </a>
      </div>
    </main>
  );
}
