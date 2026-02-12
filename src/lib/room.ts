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
  AnswerRevealScope,
  GameResult,
  RevealConfig,
  PlayerBoard,
} from "@/types/room";
import { generateDeck, createEmptyBoard } from "./deckGenerator";

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
      stepTimestamps: { "s0": Date.now() },
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

  // ゲーム結果の自動保存（ゲームステップからの遷移時）
  const currentStepDef = room.scenario?.steps?.[currentStep];
  if (currentStepDef && (currentStepDef.type === "table_game" || currentStepDef.type === "whole_game") && room.currentGame) {
    const cg = room.currentGame;
    const isStreamsGame = cg.type === "krukkurin" || cg.type === "meta_streams";

    if (isStreamsGame) {
      // Streams系: boards から累積スコアを取得
      const scores: Record<string, number> = {};
      if (cg.boards) {
        Object.entries(cg.boards).forEach(([pid, board]) => {
          scores[pid] = board.score || 0;
        });
      }
      const gameResult: GameResult = {
        type: cg.type,
        scope: cg.scope,
        questions: {},
        answers: {},
        scores,
        completedAt: Date.now(),
        streamsHistory: cg.streams?.history || [],
        boards: cg.boards || {},
      };
      await saveGameResult(roomId, currentStep, gameResult);
    } else {
      const { calculateTotalScores } = await import("./scoring");
      const scores = calculateTotalScores(
        cg.type,
        cg.answers || {},
        cg.scope,
      );
      const gameResult: GameResult = {
        type: cg.type,
        scope: cg.scope,
        questions: cg.questions || {},
        answers: cg.answers || {},
        scores,
        completedAt: Date.now(),
      };
      await saveGameResult(roomId, currentStep, gameResult);
    }
  }

  if (currentStep < totalSteps - 1) {
    const nextStep = currentStep + 1;
    const roomRef = ref(getDb(), `rooms/${roomId}`);
    await update(roomRef, {
      "state/currentStep": nextStep,
      "state/phase": "waiting",
      [`state/stepTimestamps/s${nextStep}`]: Date.now(),
      currentGame: null,
    });
  }
}

// 前のステップへ
export async function goToPrevStep(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) return;

  const currentStep = room.state.currentStep;

  if (currentStep > 0) {
    const prevStep = currentStep - 1;
    const roomRef = ref(getDb(), `rooms/${roomId}`);
    await update(roomRef, {
      "state/currentStep": prevStep,
      "state/phase": "waiting",
      [`state/stepTimestamps/s${prevStep}`]: Date.now(),
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
  scope: "table" | "whole",
  autoProgress: boolean,
  anonymousMode?: boolean,
): Promise<void> {
  const gameRef = ref(getDb(), `rooms/${roomId}/currentGame`);
  const game: CurrentGame = {
    type: gameType,
    scope,
    autoProgress,
    anonymousMode: anonymousMode || undefined,
  };
  await set(gameRef, stripUndefined(game));
  await setPhase(roomId, "playing");
}

// テーブルの進行状態を更新
export async function advanceTableProgress(roomId: string, tableKey: string, nextIndex: number): Promise<void> {
  const progressRef = ref(getDb(), `rooms/${roomId}/currentGame/tableProgress/${tableKey}`);
  await set(progressRef, nextIndex);
}

// 全体モードの進行状態を更新
export async function advanceGameProgress(roomId: string, nextIndex: number): Promise<void> {
  const idxRef = ref(getDb(), `rooms/${roomId}/currentGame/currentQuestionIdx`);
  await set(idxRef, nextIndex);
}

// お題の送出（ログ形式で蓄積）
export async function sendQuestion(
  roomId: string,
  text: string,
  inputType: "text" | "number" | "select" = "text",
  options?: string[],
  presetIndex?: number // 事前設定お題のインデックス（送出済み追跡用）
): Promise<void> {
  const roomRef = ref(getDb(), `rooms/${roomId}`);
  const questionId = `q_${Date.now()}`;

  // Firebase は undefined を受け付けないので、options は select 時のみ含める
  const question: Question = inputType === "select" && options
    ? { text, timeLimit: 0, status: "open", inputType, options, sentAt: Date.now() }
    : { text, timeLimit: 0, status: "open", inputType, sentAt: Date.now() };

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

// 回答の締切（指定のお題）
export async function closeQuestion(roomId: string, questionId?: string): Promise<void> {
  let targetId = questionId;
  if (!targetId) {
    const room = await getRoom(roomId);
    targetId = room?.currentGame?.activeQuestionId;
  }
  if (!targetId) return;

  const statusRef = ref(getDb(), `rooms/${roomId}/currentGame/questions/${targetId}/status`);
  await set(statusRef, "closed");
}

// 結果の公開（指定のお題 + スコープ）
export async function revealAnswers(
  roomId: string,
  questionId?: string,
  revealScope?: AnswerRevealScope
): Promise<void> {
  let targetId = questionId;
  if (!targetId) {
    const room = await getRoom(roomId);
    targetId = room?.currentGame?.activeQuestionId;
  }
  if (!targetId) return;

  const roomRef = ref(getDb(), `rooms/${roomId}`);
  const updates: Record<string, unknown> = {
    [`currentGame/questions/${targetId}/status`]: "revealed",
  };
  if (revealScope) {
    updates[`currentGame/questions/${targetId}/revealScope`] = revealScope;
  }
  await update(roomRef, updates);
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

// スコアボード表示トグル
export async function toggleScoreboard(roomId: string, show: boolean): Promise<void> {
  await update(ref(getDb(), `rooms/${roomId}/currentGame`), {
    showScoreboard: show || null,
  });
}

// ゲーム結果の永続化
export async function saveGameResult(roomId: string, stepIndex: number, gameResult: GameResult): Promise<void> {
  const resultRef = ref(getDb(), `rooms/${roomId}/gameResults/${stepIndex}`);
  await set(resultRef, stripUndefined(gameResult));
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
    updates[`state/stepTimestamps/s${currentStep + 1}`] = Date.now();
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

// テーブル情報をプッシュ（管理者の作業用 tableNumber をスナップショットとして公開）
export async function publishTables(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room || !room.players) return;

  const assignments: Record<string, number> = {};
  Object.entries(room.players).forEach(([id, player]) => {
    assignments[id] = player.tableNumber;
  });

  const now = Date.now();
  const roomRef = ref(getDb(), `rooms/${roomId}`);
  const historyRef = push(ref(getDb(), `rooms/${roomId}/publishHistory`));

  await update(roomRef, {
    publishedTables: { assignments, pushedAt: now },
    [`publishHistory/${historyRef.key}`]: { pushedAt: now, assignments },
  });
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

// ========== Streams系ゲーム（くるっくりん / メタストリームス） ==========

// ゲーム開始（デッキ生成→ボード初期化）
export async function initStreamsGame(
  roomId: string,
  gameType: GameType,
): Promise<void> {
  const room = await getRoom(roomId);
  if (!room || !room.players) return;

  const deck = generateDeck(gameType);
  const boards: Record<string, PlayerBoard> = {};

  // 全参加者分のボードを初期化
  Object.keys(room.players).forEach((pid) => {
    boards[pid] = {
      rows: createEmptyBoard(gameType),
      passCount: 0,
      eliminated: false,
      completed: false,
      score: 0,
      acted: false,
    };
  });

  const roomRef = ref(getDb(), `rooms/${roomId}`);
  await update(roomRef, {
    currentGame: stripUndefined({
      type: gameType,
      scope: "whole" as const,
      autoProgress: false,
      streams: {
        deck,
        currentCardIdx: -1,
        currentCard: null,
        history: [],
      },
      boards,
    }),
    "state/phase": "playing",
  });
}

// カードをめくる
export async function flipCard(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room?.currentGame?.streams) return;

  const streams = room.currentGame.streams;
  const nextIdx = streams.currentCardIdx + 1;
  if (nextIdx >= streams.deck.length) return;

  const number = streams.deck[nextIdx];
  const points = Math.floor(Math.random() * 21) + 5; // 5-25
  const card = { number, points, flippedAt: Date.now() };

  // 全プレイヤーの acted をリセット
  const updates: Record<string, unknown> = {
    "currentGame/streams/currentCardIdx": nextIdx,
    "currentGame/streams/currentCard": card,
  };

  // 履歴に追加
  const history = streams.history || [];
  updates[`currentGame/streams/history`] = [...history, card];

  // 全員のacted をリセット（脱落・完了者を除く）
  if (room.currentGame.boards) {
    Object.entries(room.currentGame.boards).forEach(([pid, board]) => {
      if (!board.eliminated && !board.completed) {
        updates[`currentGame/boards/${pid}/acted`] = false;
      }
    });
  }

  const roomRef = ref(getDb(), `rooms/${roomId}`);
  await update(roomRef, updates);
}

// カードを配置
export async function placeCard(
  roomId: string,
  playerId: string,
  rowIndex: number,
  slotIndex: number,
): Promise<{ success: boolean; error?: string }> {
  const room = await getRoom(roomId);
  if (!room?.currentGame?.streams?.currentCard || !room.currentGame.boards) {
    return { success: false, error: "ゲーム状態が無効です" };
  }

  const board = room.currentGame.boards[playerId];
  if (!board) return { success: false, error: "ボードが見つかりません" };
  if (board.eliminated) return { success: false, error: "脱落済みです" };
  if (board.acted) return { success: false, error: "既にアクション済みです" };

  const card = room.currentGame.streams.currentCard;
  const gameType = room.currentGame.type;
  const rows = board.rows;

  // バリデーション: 指定マスが空か
  if (rows[rowIndex]?.[slotIndex] !== null && rows[rowIndex]?.[slotIndex] !== undefined) {
    return { success: false, error: "そのマスは空いていません" };
  }
  if (rows[rowIndex]?.[slotIndex] === undefined) {
    return { success: false, error: "無効なマス位置です" };
  }

  // くるっくりん: 前回と違う列制約
  if (gameType === "krukkurin" && board.lastRow !== undefined && board.lastRow === rowIndex) {
    return { success: false, error: "前回と同じ列には配置できません" };
  }

  // 昇順バリデーション（左から昇順、同値OK）
  const row = rows[rowIndex];
  // 左側のチェック: slotIndex より左にある最も近い数字は card.number 以下でなければならない
  let leftVal: number | null = null;
  for (let i = slotIndex - 1; i >= 0; i--) {
    if (row[i] !== null) {
      leftVal = row[i];
      break;
    }
  }
  if (leftVal !== null && leftVal > card.number) {
    return { success: false, error: "昇順ルール違反です（左の値より小さい）" };
  }
  // 右側のチェック: slotIndex より右にある最も近い数字は card.number 以上でなければならない
  let rightVal: number | null = null;
  for (let i = slotIndex + 1; i < row.length; i++) {
    if (row[i] !== null) {
      rightVal = row[i];
      break;
    }
  }
  if (rightVal !== null && rightVal < card.number) {
    return { success: false, error: "昇順ルール違反です（右の値より大きい）" };
  }

  // 配置実行
  const newScore = board.score + card.points;
  const newRows = rows.map((r) => [...r]);
  newRows[rowIndex][slotIndex] = card.number;

  // 完了チェック: 全マスが埋まったか
  const allFilled = newRows.every((r) => r.every((v) => v !== null));

  const updates: Record<string, unknown> = {
    [`currentGame/boards/${playerId}/rows`]: newRows,
    [`currentGame/boards/${playerId}/score`]: newScore,
    [`currentGame/boards/${playerId}/acted`]: true,
    [`currentGame/boards/${playerId}/completed`]: allFilled,
  };
  if (gameType === "krukkurin") {
    updates[`currentGame/boards/${playerId}/lastRow`] = rowIndex;
  }

  const roomRef = ref(getDb(), `rooms/${roomId}`);
  await update(roomRef, updates);
  return { success: true };
}

// パスする
export async function passCard(
  roomId: string,
  playerId: string,
): Promise<{ success: boolean; error?: string }> {
  const room = await getRoom(roomId);
  if (!room?.currentGame?.boards) {
    return { success: false, error: "ゲーム状態が無効です" };
  }

  const board = room.currentGame.boards[playerId];
  if (!board) return { success: false, error: "ボードが見つかりません" };
  if (board.eliminated) return { success: false, error: "脱落済みです" };
  if (board.acted) return { success: false, error: "既にアクション済みです" };

  const newPassCount = board.passCount + 1;
  const isEliminated = newPassCount >= 4;

  const updates: Record<string, unknown> = {
    [`currentGame/boards/${playerId}/passCount`]: newPassCount,
    [`currentGame/boards/${playerId}/score`]: board.score - 1,
    [`currentGame/boards/${playerId}/acted`]: true,
    [`currentGame/boards/${playerId}/eliminated`]: isEliminated,
  };

  const roomRef = ref(getDb(), `rooms/${roomId}`);
  await update(roomRef, updates);
  return { success: true };
}
