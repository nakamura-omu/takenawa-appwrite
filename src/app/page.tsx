"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createRoom, getRoom, addPlayer, subscribeToPlayer, subscribeToRoom, subscribeToPlayers, subscribeToMessages, submitStepResponse, getRoomsByCreator, registerPresence } from "@/lib/room";
import { ensureAnonymousUser } from "@/lib/firebase";
import { Room, Player, EntryField, ScenarioStep, StepDisplayConfig, TimelineSnapshot, AdminMessage, StepResponse, StepInputReveal } from "@/types/room";

// メッセージ中のプレースホルダー置換
function resolveMessage(template: string, player: Player): string {
  return template
    .replace(/\{tableNumber\}/g, String(player.tableNumber))
    .replace(/\{name\}/g, player.name);
}

// ステップタイプに応じたデフォルト表示
function getDefaultDisplay(step: ScenarioStep): StepDisplayConfig {
  switch (step.type) {
    case "entry":
      return { message: "エントリー完了！" };
    case "break":
      return { message: "歓談タイムです" };
    case "end":
      return { message: "お疲れさまでした！" };
    default:
      return { message: step.label };
  }
}

// スナップショットの読み書き
function loadSnapshots(roomId: string, playerId: string): Record<number, TimelineSnapshot> {
  try {
    const raw = localStorage.getItem(`timeline_${roomId}_${playerId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSnapshots(roomId: string, playerId: string, snapshots: Record<number, TimelineSnapshot>) {
  localStorage.setItem(`timeline_${roomId}_${playerId}`, JSON.stringify(snapshots));
}

// テーブル番号表示（共通パーツ）
function TableBadge({ tableNum }: { tableNum: number }) {
  if (tableNum > 0) {
    return (
      <div className="bg-blue-900/40 border border-blue-500 rounded-lg p-3 text-center">
        <p className="text-xs text-blue-300 mb-1">あなたのテーブル</p>
        <p className="text-3xl font-bold text-blue-400">{tableNum}</p>
      </div>
    );
  }
  if (tableNum === -1) {
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-center">
        <p className="text-xs text-gray-400 mb-1">テーブル</p>
        <p className="text-sm text-gray-500">テーブル外</p>
      </div>
    );
  }
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-400 mb-1">テーブル番号</p>
      <p className="text-sm text-yellow-400">割り当て待ち...</p>
    </div>
  );
}

// タイムラインカード
function TimelineCard({
  stepIndex,
  step,
  player,
  snapshot,
  prevSnapshot,
  isCurrent,
  entryFields,
  allPlayers,
  playerId,
}: {
  stepIndex: number;
  step: ScenarioStep;
  player: Player;
  snapshot?: TimelineSnapshot;
  prevSnapshot?: TimelineSnapshot;
  isCurrent: boolean;
  entryFields: EntryField[];
  allPlayers?: Record<string, Player> | null;
  playerId?: string | null;
}) {
  const display = step.display || getDefaultDisplay(step);
  // 現在のステップはライブデータ、過去のステップはスナップショット
  const tableNum = isCurrent ? player.tableNumber : (snapshot?.tableNumber ?? player.tableNumber);

  // テーブルメイト: 現在のステップはライブデータから取得、過去はスナップショット
  const tablemates: string[] = (() => {
    if (!isCurrent) return snapshot?.tablemates ?? [];
    if (!allPlayers || !playerId || tableNum <= 0) return [];
    return Object.entries(allPlayers)
      .filter(([pid, p]) => pid !== playerId && p.tableNumber === tableNum)
      .map(([, p]) => p.name);
  })();
  // テーブルが前のステップから変わったか
  const tableChanged = prevSnapshot && prevSnapshot.tableNumber > 0 && tableNum > 0 && tableNum !== prevSnapshot.tableNumber;

  return (
    <div className="relative pl-6 pb-6">
      {/* タイムラインの縦線 */}
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
      {/* ドット */}
      <div className={`absolute left-0.5 top-1.5 w-3 h-3 rounded-full border-2 border-gray-950 ${isCurrent ? "bg-green-500" : "bg-blue-500"}`} />

      <div className={`bg-gray-900 rounded-lg p-4 border ${isCurrent ? "border-green-800" : "border-gray-800"}`}>
        <p className="text-xs text-gray-500 mb-2">
          Step {stepIndex + 1}: {step.label}
        </p>

        {/* テーブル変更通知 */}
        {tableChanged && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-2 mb-2 text-center">
            <p className="text-xs text-yellow-400">テーブルが変わりました</p>
            <p className="text-sm font-bold text-yellow-300">テーブル {prevSnapshot.tableNumber} → {tableNum}</p>
          </div>
        )}

        {/* メッセージ */}
        {display.message && (
          <p className="text-sm font-medium mb-2 whitespace-pre-wrap">
            {resolveMessage(display.message, player)}
          </p>
        )}

        {/* テーブル番号（entryステップ） */}
        {step.type === "entry" && (
          <div className="mb-2">
            <TableBadge tableNum={tableNum} />
          </div>
        )}

        {/* テーブル番号（entry以外でテーブル情報を出す場合） */}
        {step.type !== "entry" && tableNum > 0 && display.showTablemates && !tableChanged && (
          <div className="bg-gray-800 rounded p-2 mb-2 text-center">
            <p className="text-xs text-gray-400">テーブル {tableNum}</p>
          </div>
        )}

        {/* テーブルメイト */}
        {display.showTablemates && tablemates.length > 0 && (
          <div className="mb-2">
            <p className="text-xs text-gray-500 mb-1">テーブル{tableNum}のメンバー:</p>
            <p className="text-sm text-gray-300">{tablemates.join("、")}</p>
          </div>
        )}

        {/* 表示フィールド */}
        {display.showFields && display.showFields.length > 0 && snapshot?.fieldValues && (
          <div className="space-y-1">
            {display.showFields.map((fieldId) => {
              const field = entryFields.find((f) => f.id === fieldId);
              const val = snapshot.fieldValues?.[fieldId];
              if (!field || val === undefined || val === "") return null;
              return (
                <div key={fieldId} className="flex justify-between text-xs">
                  <span className="text-gray-500">{field.label}</span>
                  <span className="text-gray-300">{String(val)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// 管理者メッセージカード
function MessageCard({ message, senderName }: { message: AdminMessage; senderName?: string }) {
  return (
    <div className="relative pl-6 pb-6">
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
      <div className="absolute left-0.5 top-1.5 w-3 h-3 rounded-full border-2 border-gray-950 bg-yellow-500" />
      <div className="bg-yellow-900/20 rounded-lg p-4 border border-yellow-700/50">
        <p className="text-xs text-yellow-400 mb-1">{senderName || "主催より"}</p>
        <p className="text-sm font-medium text-yellow-200 whitespace-pre-wrap">{message.text}</p>
      </div>
    </div>
  );
}

// ステップ入力フォーム（TimelineCard内で使用）
function StepInputForm({
  roomId,
  stepIndex,
  step,
  playerId,
  playerName,
  tableNumber,
  existingResponse,
}: {
  roomId: string;
  stepIndex: number;
  step: ScenarioStep;
  playerId: string;
  playerName: string;
  tableNumber: number;
  existingResponse?: StepResponse;
}) {
  const [value, setValue] = useState<string | number>(existingResponse?.value ?? "");
  const [submitted, setSubmitted] = useState(!!existingResponse);
  const [submitting, setSubmitting] = useState(false);

  if (!step.input) return null;

  const handleSubmit = async () => {
    if (submitting) return;
    const finalValue = step.input!.inputType === "number" ? Number(value) || 0 : String(value);
    if (finalValue === "" || finalValue === 0) return;
    setSubmitting(true);
    await submitStepResponse(roomId, stepIndex, playerId, finalValue, playerName, tableNumber);
    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="mt-2 p-2 bg-green-900/20 border border-green-700/30 rounded">
        <p className="text-xs text-green-400">送信済み: {String(existingResponse?.value ?? value)}</p>
      </div>
    );
  }

  return (
    <div className="mt-2 p-2 bg-purple-900/20 border border-purple-700/30 rounded space-y-2">
      <p className="text-xs font-medium text-purple-300">{step.input.prompt}</p>
      {step.input.inputType === "select" ? (
        <select
          value={String(value)}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm focus:outline-none focus:border-purple-500"
        >
          <option value="">選択してください</option>
          {(step.input.options || []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type={step.input.inputType === "number" ? "number" : "text"}
          value={String(value)}
          onChange={(e) => setValue(step.input!.inputType === "number" ? e.target.value : e.target.value)}
          placeholder="回答を入力..."
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm focus:outline-none focus:border-purple-500"
        />
      )}
      <button
        onClick={handleSubmit}
        disabled={submitting || value === ""}
        className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-sm font-semibold transition"
      >
        {submitting ? "送信中..." : "送信"}
      </button>
    </div>
  );
}

// 開示された回答の表示
function RevealedResponses({
  stepIndex,
  room,
  playerTableNumber,
}: {
  stepIndex: number;
  room: Room;
  playerTableNumber: number;
}) {
  const reveal: StepInputReveal | undefined = room.stepReveals?.[String(stepIndex)];
  if (!reveal || reveal.mode === "admin_only") return null;

  const responses = room.stepResponses?.[String(stepIndex)];
  if (!responses) return null;

  let entries = Object.values(responses);
  if (reveal.target === "same_table") {
    entries = entries.filter((r) => r.tableNumber === playerTableNumber);
  }

  if (entries.length === 0) return null;

  return (
    <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700/30 rounded">
      <p className="text-xs text-blue-400 mb-1">みんなの回答:</p>
      <div className="space-y-0.5">
        {entries.map((r, i) => (
          <p key={i} className="text-xs text-gray-300">
            {reveal.mode === "named" ? (
              <><span className="text-gray-400">{r.playerName}: </span>{String(r.value)}</>
            ) : (
              String(r.value)
            )}
          </p>
        ))}
      </div>
    </div>
  );
}

// 参加者エントリーフォーム + タイムライン
function EntryForm({ roomId }: { roomId: string }) {
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
                  {/* 入力フォーム（現在ステップ＆入力設定あり） */}
                  {item.step.input && idx === currentStep && (
                    <div className="relative pl-6 pb-2 -mt-4">
                      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                      <StepInputForm
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
                  {/* 開示された回答 */}
                  {item.step.input && room.stepReveals?.[String(idx)] && (
                    <div className="relative pl-6 pb-2 -mt-4">
                      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                      <RevealedResponses
                        stepIndex={idx}
                        room={room}
                        playerTableNumber={playerData.tableNumber}
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

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomParam = searchParams.get("room");

  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState("");

  // マイルーム
  const [myRooms, setMyRooms] = useState<{ id: string; room: Room }[]>([]);
  const [myRoomsLoading, setMyRoomsLoading] = useState(true);

  // 匿名ログイン + マイルーム取得
  useEffect(() => {
    if (roomParam) return; // エントリーフォーム表示時はスキップ
    (async () => {
      try {
        const uid = await ensureAnonymousUser();
        const rooms = await getRoomsByCreator(uid);
        setMyRooms(rooms);
      } catch {
        // Auth未有効でもエラーにしない
      } finally {
        setMyRoomsLoading(false);
      }
    })();
  }, [roomParam]);

  // ?room=XXX がある場合はエントリーフォームを表示
  if (roomParam) {
    return <EntryForm roomId={roomParam} />;
  }

  const handleCreateRoom = async () => {
    if (!eventName.trim() || !eventDate || !adminPassword) return;
    setIsCreating(true);
    try {
      let uid: string | undefined;
      try { uid = await ensureAnonymousUser(); } catch { /* Auth未有効 */ }
      const id = await createRoom(eventName.trim(), eventDate, adminPassword, uid);
      // パスワード認証済みとしてsessionStorageに保存
      sessionStorage.setItem(`admin_${id}`, "1");
      router.push(`/admin/${id}`);
    } catch (error) {
      console.error("ルーム作成エラー:", error);
      alert("ルーム作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = () => {
    const id = joinRoomId.trim().toUpperCase();
    if (id) {
      router.push(`/?room=${id}`);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* ヒーロー */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-2">Takenawa</h1>
        <p className="text-gray-400">幹事進行型の宴会ゲームアプリ</p>
      </div>

      <div className="w-full max-w-md space-y-8">
        {/* マイルーム */}
        {!myRoomsLoading && myRooms.length > 0 && (
          <section className="bg-gray-900 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">マイルーム</h2>
            <p className="text-sm text-gray-400 mb-3">
              このブラウザで作成したルーム
            </p>
            <div className="space-y-2">
              {myRooms.map(({ id, room: r }) => (
                <div
                  key={id}
                  className="flex items-center justify-between bg-gray-800 rounded-lg p-3"
                >
                  <div>
                    <p className="font-medium text-sm">{r.config.eventName}</p>
                    <p className="text-xs text-gray-500">
                      {r.config.eventDate} / {id}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      sessionStorage.setItem(`admin_${id}`, "1");
                      router.push(`/admin/${id}`);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-semibold transition"
                  >
                    管理画面
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 宴会をつくる */}
        <section className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">宴会をつくる</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                イベント名
              </label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="例: 2026年 新年会"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                予定日
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                管理者のあいことば
              </label>
              <input
                type="text"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="例: さくら"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={isCreating || !eventName.trim() || !eventDate || !adminPassword}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-semibold transition"
            >
              {isCreating ? "作成中..." : "宴会をつくる"}
            </button>
          </div>
        </section>

        {/* 既存ルームに入る */}
        <section className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">ルームに入る</h2>
          <p className="text-sm text-gray-400 mb-4">
            QRコードを読み取るか、ルームIDを入力してください。
          </p>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
              placeholder="ルームID（例: AB12345）"
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              maxLength={10}
            />
            <button
              onClick={handleJoinRoom}
              disabled={!joinRoomId.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-semibold transition"
            >
              参加
            </button>
          </div>
          <button
            onClick={() => {
              const id = joinRoomId.trim().toUpperCase();
              if (id) router.push(`/admin/${id}`);
            }}
            disabled={!joinRoomId.trim()}
            className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 transition mt-1"
          >
            管理画面に入る →
          </button>
        </section>

      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}
