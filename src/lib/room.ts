import { ref, set, get, update, onValue, off, push, query, orderByChild, equalTo, onDisconnect } from "firebase/database";
import { getDb } from "./firebase";
import {
  Room,
  RoomConfig,
  RoomState,
  ScenarioStep,
  Player,
  CurrentGame,
  Question,
  Answer,
  DEFAULT_SCENARIO_STEPS,
  Phase,
  GameType,
  EntryField,
  AdminMessage,
  MessageTarget,
  StepResponse,
  StepInputReveal,
} from "@/types/room";

// ルームIDの生成（英字2文字 + 数字5文字 = 7文字）
export function generateRoomId(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // 紛らわしい文字を除外
  const digits = "0123456789";
  let result = "";
  for (let i = 0; i < 2; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 5; i++) {
    result += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return result;
}

// ルーム作成
export async function createRoom(
  eventName: string,
  eventDate: string,
  adminPassword: string,
  creatorUid?: string,
): Promise<string> {
  const roomId = generateRoomId();
  const roomRef = ref(getDb(), `rooms/${roomId}`);

  const initialRoom: Room = {
    config: {
      eventName,
      eventDate,
      tableCount: 6,
      createdAt: Date.now(),
      adminPassword,
      creatorUid,
      entryFields: [
        { id: "name", label: "名前", type: "text", required: true },
      ],
    },
    state: {
      currentStep: 0,
      phase: "waiting",
    },
    scenario: {
      steps: DEFAULT_SCENARIO_STEPS,
    },
  };

  await set(roomRef, initialRoom);
  return roomId;
}

// ルーム取得
export async function getRoom(roomId: string): Promise<Room | null> {
  const roomRef = ref(getDb(), `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  return snapshot.exists() ? snapshot.val() : null;
}

// UIDでルーム一覧を取得（マイルーム）
export async function getRoomsByCreator(uid: string): Promise<{ id: string; room: Room }[]> {
  const roomsRef = ref(getDb(), "rooms");
  const q = query(roomsRef, orderByChild("config/creatorUid"), equalTo(uid));
  const snapshot = await get(q);
  if (!snapshot.exists()) return [];
  const results: { id: string; room: Room }[] = [];
  snapshot.forEach((child) => {
    results.push({ id: child.key!, room: child.val() });
  });
  return results.sort((a, b) => b.room.config.createdAt - a.room.config.createdAt);
}

// ルーム削除
export async function deleteRoom(roomId: string): Promise<void> {
  const roomRef = ref(getDb(), `rooms/${roomId}`);
  await set(roomRef, null);
}

// ルームの購読
export function subscribeToRoom(
  roomId: string,
  callback: (room: Room | null) => void
): () => void {
  const roomRef = ref(getDb(), `rooms/${roomId}`);
  const unsubscribe = onValue(roomRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
  return () => off(roomRef);
}

// undefinedを再帰的に除去（Firebase は undefined を受け付けない）
function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(stripUndefined) as T;
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    ) as T;
  }
  return obj;
}

// 台本の更新
export async function updateScenario(roomId: string, steps: ScenarioStep[]): Promise<void> {
  const scenarioRef = ref(getDb(), `rooms/${roomId}/scenario/steps`);
  await set(scenarioRef, stripUndefined(steps));
}

// 台本ステップの追加
export async function addScenarioStep(roomId: string, step: ScenarioStep): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) return;
  const steps = room.scenario?.steps || [];
  steps.push(step);
  await updateScenario(roomId, steps);
}

// ステート更新（進行操作）
export async function updateRoomState(
  roomId: string,
  state: Partial<RoomState>
): Promise<void> {
  const stateRef = ref(getDb(), `rooms/${roomId}/state`);
  await update(stateRef, state);
}

// 次のステップへ
export async function goToNextStep(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) return;

  const currentStep = room.state.currentStep;
  const totalSteps = room.scenario?.steps?.length || 0;

  if (currentStep < totalSteps - 1) {
    await updateRoomState(roomId, {
      currentStep: currentStep + 1,
      phase: "waiting",
    });
  }
}

// 前のステップへ
export async function goToPrevStep(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) return;

  const currentStep = room.state.currentStep;

  if (currentStep > 0) {
    await updateRoomState(roomId, {
      currentStep: currentStep - 1,
      phase: "waiting",
    });
  }
}

// フェーズの更新
export async function setPhase(roomId: string, phase: Phase): Promise<void> {
  await updateRoomState(roomId, { phase });
}

// ゲーム開始
export async function startGame(
  roomId: string,
  gameType: GameType,
  round?: number
): Promise<void> {
  const gameRef = ref(getDb(), `rooms/${roomId}/currentGame`);
  const game: CurrentGame = {
    type: gameType,
    round,
  };
  await set(gameRef, game);
  await setPhase(roomId, "playing");
}

// お題の送出（ログ形式で蓄積）
export async function sendQuestion(
  roomId: string,
  text: string,
  timeLimit: number = 30,
  inputType: "text" | "number" | "select" = "text",
  options?: string[],
  presetIndex?: number // 事前設定お題のインデックス（送出済み追跡用）
): Promise<void> {
  const roomRef = ref(getDb(), `rooms/${roomId}`);
  const questionId = `q_${Date.now()}`;

  // Firebase は undefined を受け付けないので、options は select 時のみ含める
  const question: Question = inputType === "select" && options
    ? { text, timeLimit, status: "open", inputType, options, sentAt: Date.now() }
    : { text, timeLimit, status: "open", inputType, sentAt: Date.now() };

  const updates: Record<string, unknown> = {
    [`currentGame/questions/${questionId}`]: question,
    "currentGame/activeQuestionId": questionId,
  };

  // 事前設定お題の場合、送出済みリストに追加
  if (presetIndex !== undefined) {
    const room = await getRoom(roomId);
    const currentSent = room?.currentGame?.sentQuestionIndices || [];
    if (!currentSent.includes(presetIndex)) {
      updates["currentGame/sentQuestionIndices"] = [...currentSent, presetIndex];
    }
  }

  await update(roomRef, updates);
}

// 回答の締切（アクティブなお題）
export async function closeQuestion(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  const activeId = room?.currentGame?.activeQuestionId;
  if (!activeId) return;

  const statusRef = ref(getDb(), `rooms/${roomId}/currentGame/questions/${activeId}/status`);
  await set(statusRef, "closed");
}

// 結果の公開（アクティブなお題）
export async function revealAnswers(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  const activeId = room?.currentGame?.activeQuestionId;
  if (!activeId) return;

  const statusRef = ref(getDb(), `rooms/${roomId}/currentGame/questions/${activeId}/status`);
  await set(statusRef, "revealed");
}

// ゲームリセット（全お題・回答をクリア）
export async function resetCurrentGame(roomId: string): Promise<void> {
  const roomRef = ref(getDb(), `rooms/${roomId}/currentGame`);
  await update(ref(getDb(), `rooms/${roomId}`), {
    "currentGame/questions": null,
    "currentGame/answers": null,
    "currentGame/activeQuestionId": null,
    "currentGame/sentQuestionIndices": null,
  });
}

// 参加者一覧の購読
export function subscribeToPlayers(
  roomId: string,
  callback: (players: Record<string, Player> | null) => void
): () => void {
  const playersRef = ref(getDb(), `rooms/${roomId}/players`);
  onValue(playersRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
  return () => off(playersRef);
}

// テーブル数の更新
export async function updateTableCount(roomId: string, count: number): Promise<void> {
  const configRef = ref(getDb(), `rooms/${roomId}/config/tableCount`);
  await set(configRef, count);
}

// 管理者名の更新
export async function updateAdminName(roomId: string, name: string): Promise<void> {
  const nameRef = ref(getDb(), `rooms/${roomId}/config/adminName`);
  await set(nameRef, name || null);
}

// イベント名の更新
export async function updateEventName(roomId: string, name: string): Promise<void> {
  const nameRef = ref(getDb(), `rooms/${roomId}/config/eventName`);
  await set(nameRef, name);
}

// イベント日時の更新
export async function updateEventDate(roomId: string, date: string): Promise<void> {
  const dateRef = ref(getDb(), `rooms/${roomId}/config/eventDate`);
  await set(dateRef, date);
}

// エントリーフィールドの更新
export async function updateEntryFields(roomId: string, fields: EntryField[]): Promise<void> {
  const fieldsRef = ref(getDb(), `rooms/${roomId}/config/entryFields`);
  await set(fieldsRef, fields);
}

// 参加者のテーブル番号を更新
export async function updatePlayerTable(roomId: string, playerId: string, tableNumber: number): Promise<void> {
  const tableRef = ref(getDb(), `rooms/${roomId}/players/${playerId}/tableNumber`);
  await set(tableRef, tableNumber);
}

// 参加者のフィールドを更新（追加項目への対応）
export async function updatePlayerFields(
  roomId: string,
  playerId: string,
  fields: Record<string, string | number>
): Promise<void> {
  const fieldsRef = ref(getDb(), `rooms/${roomId}/players/${playerId}/fields`);
  await update(fieldsRef, fields);
}

// 参加者の削除（キック）
export async function removePlayer(roomId: string, playerId: string): Promise<void> {
  const playerRef = ref(getDb(), `rooms/${roomId}/players/${playerId}`);
  await set(playerRef, null);
}

// 個別参加者の購読
export function subscribeToPlayer(
  roomId: string,
  playerId: string,
  callback: (player: Player | null) => void
): () => void {
  const playerRef = ref(getDb(), `rooms/${roomId}/players/${playerId}`);
  onValue(playerRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
  return () => off(playerRef);
}

// 参加者の追加
export async function addPlayer(roomId: string, playerData: Omit<Player, "connected" | "joinedAt">): Promise<string> {
  const playersRef = ref(getDb(), `rooms/${roomId}/players`);
  const newRef = push(playersRef);
  const player: Player = {
    ...playerData,
    connected: true,
    joinedAt: Date.now(),
  };
  await set(newRef, player);
  return newRef.key!;
}

// ========== 管理者メッセージ ==========

// メッセージ送信
export async function sendAdminMessage(
  roomId: string,
  text: string,
  target: MessageTarget,
  currentStep: number
): Promise<void> {
  const messagesRef = ref(getDb(), `rooms/${roomId}/messages`);
  const newRef = push(messagesRef);
  const message: AdminMessage = {
    id: newRef.key!,
    text,
    target,
    sentAt: Date.now(),
    sentDuringStep: currentStep,
  };
  await set(newRef, message);
}

// メッセージ購読
export function subscribeToMessages(
  roomId: string,
  callback: (messages: Record<string, AdminMessage> | null) => void
): () => void {
  const messagesRef = ref(getDb(), `rooms/${roomId}/messages`);
  onValue(messagesRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
  return () => off(messagesRef);
}

// ========== ステップ入力・回答 ==========

// 参加者の回答送信
export async function submitStepResponse(
  roomId: string,
  stepIndex: number,
  playerId: string,
  value: string | number,
  playerName: string,
  tableNumber: number
): Promise<void> {
  const responseRef = ref(getDb(), `rooms/${roomId}/stepResponses/${stepIndex}/${playerId}`);
  const response: StepResponse = {
    value,
    submittedAt: Date.now(),
    playerName,
    tableNumber,
  };
  await set(responseRef, response);
}

// 特定ステップの回答購読（管理者用）
export function subscribeToStepResponses(
  roomId: string,
  stepIndex: number,
  callback: (responses: Record<string, StepResponse> | null) => void
): () => void {
  const responsesRef = ref(getDb(), `rooms/${roomId}/stepResponses/${stepIndex}`);
  onValue(responsesRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
  return () => off(responsesRef);
}

// 開示設定
export async function setStepReveal(
  roomId: string,
  stepIndex: number,
  reveal: StepInputReveal
): Promise<void> {
  const revealRef = ref(getDb(), `rooms/${roomId}/stepReveals/${stepIndex}`);
  await set(revealRef, reveal);
}

// 開示解除
export async function clearStepReveal(
  roomId: string,
  stepIndex: number
): Promise<void> {
  const revealRef = ref(getDb(), `rooms/${roomId}/stepReveals/${stepIndex}`);
  await set(revealRef, null);
}

// 回答リセット（特定ステップ）
export async function resetStepResponses(
  roomId: string,
  stepIndex: number
): Promise<void> {
  const responsesRef = ref(getDb(), `rooms/${roomId}/stepResponses/${stepIndex}`);
  await set(responsesRef, null);
}

// 回答＆開示の両方をリセット
export async function resetStepAll(
  roomId: string,
  stepIndex: number
): Promise<void> {
  const roomRef = ref(getDb(), `rooms/${roomId}`);
  await update(roomRef, {
    [`stepResponses/${stepIndex}`]: null,
    [`stepReveals/${stepIndex}`]: null,
  });
}

// ========== ステップ割り込み ==========

// 割り込みステップ挿入（currentStep+1に挿入し、オプションで自動進行）
export async function insertStepAfterCurrent(
  roomId: string,
  newStep: ScenarioStep,
  autoAdvance: boolean
): Promise<void> {
  const room = await getRoom(roomId);
  if (!room || !room.scenario) return;

  const currentStep = room.state.currentStep;
  const steps = [...room.scenario.steps];
  steps.splice(currentStep + 1, 0, newStep);

  const updates: Record<string, unknown> = {
    "scenario/steps": stripUndefined(steps),
  };

  if (autoAdvance) {
    updates["state/currentStep"] = currentStep + 1;
    updates["state/phase"] = "waiting";
  }

  const roomRef = ref(getDb(), `rooms/${roomId}`);
  await update(roomRef, updates);
}

// プレゼンス（接続状態）の登録
export function registerPresence(roomId: string, playerId: string): () => void {
  const db = getDb();
  const connectedRef = ref(db, ".info/connected");
  const playerConnRef = ref(db, `rooms/${roomId}/players/${playerId}/connected`);

  const unsubscribe = onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      onDisconnect(playerConnRef).set(false);
      set(playerConnRef, true);
    }
  });

  return () => {
    unsubscribe();
    set(playerConnRef, false);
  };
}

// テーブルシャッフル（割り当て済み参加者をランダムに再配分）
export async function shuffleTables(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room || !room.players) return;

  const tableCount = room.config.tableCount || 1;
  // 割り当て済み（tableNumber > 0）の参加者IDを収集
  const assignedIds = Object.entries(room.players)
    .filter(([, p]) => p.tableNumber > 0)
    .map(([id]) => id);

  // Fisher-Yatesシャッフル
  for (let i = assignedIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignedIds[i], assignedIds[j]] = [assignedIds[j], assignedIds[i]];
  }

  // ラウンドロビンでテーブルに振り分け
  const updates: Record<string, number> = {};
  assignedIds.forEach((id, idx) => {
    updates[`players/${id}/tableNumber`] = (idx % tableCount) + 1;
  });

  if (Object.keys(updates).length > 0) {
    const roomRef = ref(getDb(), `rooms/${roomId}`);
    await update(roomRef, updates);
  }
}
