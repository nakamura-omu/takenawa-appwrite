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
  GameQuestion as GameQuestionConfig,
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
import { generateDeck, createEmptyBoard, createEmptyColors, KRUKKURIN_CARD_COLORS } from "./deckGenerator";

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

// 次のステップへ（ゲーム結果保存 + ステップ遷移をアトミックに実行）
export async function goToNextStep(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) return;

  const currentStep = room.state.currentStep;
  const totalSteps = room.scenario?.steps?.length || 0;
  if (currentStep >= totalSteps - 1) return;

  const nextStep = currentStep + 1;
  const roomRef = ref(getDb(), `rooms/${roomId}`);

  // ステップ遷移の基本更新
  const updates: Record<string, unknown> = {
    "state/currentStep": nextStep,
    "state/phase": "waiting",
    [`state/stepTimestamps/s${nextStep}`]: Date.now(),
    currentGame: null,
  };

  // ゲーム結果の自動保存（ゲームステップからの遷移時）— 同じ update に含める
  const currentStepDef = room.scenario?.steps?.[currentStep];
  if (currentStepDef && (currentStepDef.type === "table_game" || currentStepDef.type === "whole_game") && room.currentGame) {
    const cg = room.currentGame;
    const isStreamsGame = cg.type === "krukkurin" || cg.type === "meta_streams";

    let gameResult: GameResult;
    if (isStreamsGame) {
      const scores: Record<string, number> = {};
      if (cg.boards) {
        Object.entries(cg.boards).forEach(([pid, board]) => {
          scores[pid] = board.score || 0;
        });
      }
      gameResult = {
        type: cg.type,
        scope: cg.scope,
        questions: {},
        answers: {},
        scores,
        completedAt: Date.now(),
        streamsHistory: cg.streams?.history || [],
        boards: cg.boards || {},
      };
    } else {
      const { calculateTotalScores } = await import("./scoring");
      let scores: Record<string, number>;

      if (cg.scope === "table") {
        // テーブルゲーム: テーブルごとにスコア計算してマージ
        const assignments = room.publishedTables?.assignments || {};
        const tableNumbers = [...new Set(Object.values(assignments))];
        scores = {};
        for (const tNum of tableNumbers) {
          const tableScores = calculateTotalScores(cg.type, cg.answers || {}, "table", tNum, assignments);
          Object.entries(tableScores).forEach(([pid, score]) => {
            scores[pid] = (scores[pid] || 0) + score;
          });
        }
      } else {
        scores = calculateTotalScores(cg.type, cg.answers || {}, cg.scope);
      }

      gameResult = {
        type: cg.type,
        scope: cg.scope,
        questions: cg.questions || {},
        answers: cg.answers || {},
        scores,
        completedAt: Date.now(),
      };
    }

    // gameResult を同じ update バッチに含めてアトミックに書き込む
    const cleanResult = stripUndefined(gameResult);
    Object.entries(cleanResult as unknown as Record<string, unknown>).forEach(([key, value]) => {
      updates[`gameResults/${currentStep}/${key}`] = value;
    });
  }

  await update(roomRef, updates);
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

// テーブル自動進行ゲーム開始（全問題を事前ロード）
export async function startGameWithAutoProgress(
  roomId: string,
  gameType: GameType,
  presetQuestions: GameQuestionConfig[],
  anonymousMode?: boolean,
): Promise<void> {
  const questions: Record<string, Question> = {};
  const questionOrder: string[] = [];
  const now = Date.now();

  presetQuestions.forEach((pq, i) => {
    const qId = `q_${now}_${i}`;
    const q: Question = {
      text: pq.text,
      timeLimit: 0,
      status: "open",
      inputType: pq.inputType,
      sentAt: now + i,
    };
    if (pq.inputType === "select" && pq.options) {
      q.options = pq.options.filter(o => o.trim());
    }
    questions[qId] = q;
    questionOrder.push(qId);
  });

  const game: CurrentGame = {
    type: gameType,
    scope: "table",
    autoProgress: true,
    anonymousMode: anonymousMode || undefined,
    questions,
    questionOrder,
    tableProgress: {},
    activeQuestionId: questionOrder[0],
    sentQuestionIndices: presetQuestions.map((_, i) => i),
  };

  const gameRef = ref(getDb(), `rooms/${roomId}/currentGame`);
  await set(gameRef, stripUndefined(game));
  await setPhase(roomId, "playing");
}

// テーブル全員回答チェック＆自動進行
export async function checkAndAdvanceTable(
  roomId: string,
  questionId: string,
  tableNumber: number,
): Promise<boolean> {
  const room = await getRoom(roomId);
  if (!room?.currentGame?.questionOrder || !room.currentGame.autoProgress) return false;
  if (room.currentGame.scope !== "table") return false;

  const questionOrder = room.currentGame.questionOrder;
  const tableKey = `table_${tableNumber}`;
  const currentIdx = room.currentGame.tableProgress?.[tableKey] ?? 0;

  // 既に全問完了 or 対象問題がテーブルの現在の問題でない
  if (currentIdx >= questionOrder.length) return false;
  if (questionOrder[currentIdx] !== questionId) return false;

  // publishedAssignments からテーブルメンバーを取得（登録済みプレイヤーのみ）
  const assignments = room.publishedTables?.assignments || {};
  const tablePlayers = Object.entries(assignments)
    .filter(([pid, tNum]) => tNum === tableNumber && room.players?.[pid])
    .map(([pid]) => pid);

  if (tablePlayers.length === 0) return false;

  // 全員回答済みかチェック
  const answers = room.currentGame.answers?.[questionId] || {};
  const allAnswered = tablePlayers.every(pid => pid in answers);
  if (!allAnswered) return false;

  // テーブル進行
  await advanceTableProgress(roomId, tableKey, currentIdx + 1);
  return true;
}

// 管理者用: テーブルを強制進行
export async function forceAdvanceTable(
  roomId: string,
  tableNumber: number,
): Promise<void> {
  const room = await getRoom(roomId);
  if (!room?.currentGame?.questionOrder) return;

  const tableKey = `table_${tableNumber}`;
  const currentIdx = room.currentGame.tableProgress?.[tableKey] ?? 0;
  const maxIdx = room.currentGame.questionOrder.length;

  if (currentIdx < maxIdx) {
    await advanceTableProgress(roomId, tableKey, currentIdx + 1);
  }
}

// 管理者用: 全テーブルを特定インデックスまで強制進行
export async function forceAdvanceAllTables(
  roomId: string,
  targetIndex: number,
): Promise<void> {
  const room = await getRoom(roomId);
  if (!room?.currentGame?.questionOrder) return;

  const tableCount = room.config.tableCount;
  const updates: Record<string, number> = {};
  for (let t = 1; t <= tableCount; t++) {
    const tableKey = `table_${t}`;
    const currentIdx = room.currentGame.tableProgress?.[tableKey] ?? 0;
    if (currentIdx < targetIndex) {
      updates[`currentGame/tableProgress/${tableKey}`] = targetIndex;
    }
  }

  if (Object.keys(updates).length > 0) {
    const roomRef = ref(getDb(), `rooms/${roomId}`);
    await update(roomRef, updates);
  }
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

// 回答の再開（締切→受付中に戻す）
export async function reopenQuestion(roomId: string, questionId: string): Promise<void> {
  const statusRef = ref(getDb(), `rooms/${roomId}/currentGame/questions/${questionId}/status`);
  await set(statusRef, "open");
}

// 回答公開を取り消す（revealed→closedに戻し、revealScopeを削除）
export async function hideAnswers(roomId: string, questionId: string): Promise<void> {
  const roomRef = ref(getDb(), `rooms/${roomId}`);
  await update(roomRef, {
    [`currentGame/questions/${questionId}/status`]: "closed",
    [`currentGame/questions/${questionId}/revealScope`]: null,
  });
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

// ルーム設定の個別フィールドを更新
export async function updateRoomConfigField(roomId: string, field: string, value: unknown): Promise<void> {
  const fieldRef = ref(getDb(), `rooms/${roomId}/config/${field}`);
  await set(fieldRef, value);
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

// ========== 回答開示の個別表示制御 ==========

// 個別お題の可視性を設定
export async function setRevealQuestionVisibility(
  roomId: string,
  stepIndex: number,
  questionId: string,
  visible: boolean,
): Promise<void> {
  const visRef = ref(getDb(), `rooms/${roomId}/revealVisibility/${stepIndex}/${questionId}`);
  await set(visRef, visible);
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

// Fisher-Yatesシャッフル（配列をインプレースでシャッフル）
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 完全席シャッフル（全員をランダムに再配分）
export async function shuffleTables(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room || !room.players) return;

  const tableCount = room.config.tableCount || 1;
  const assignedIds = Object.entries(room.players)
    .filter(([, p]) => p.tableNumber > 0)
    .map(([id]) => id);

  shuffleArray(assignedIds);

  const updates: Record<string, number> = {};
  assignedIds.forEach((id, idx) => {
    updates[`players/${id}/tableNumber`] = (idx % tableCount) + 1;
  });

  if (Object.keys(updates).length > 0) {
    const roomRef = ref(getDb(), `rooms/${roomId}`);
    await update(roomRef, updates);
  }
}

// 半数シャッフル（各テーブルから約半数を抜き出し、別テーブルへ再配分）
export async function halfShuffleTables(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room || !room.players) return;

  const tableCount = room.config.tableCount || 1;
  if (tableCount < 2) return; // テーブル1つでは意味がない

  // テーブルごとにプレイヤーを分類
  const byTable: Record<number, string[]> = {};
  for (let t = 1; t <= tableCount; t++) byTable[t] = [];
  Object.entries(room.players).forEach(([id, p]) => {
    if (p.tableNumber > 0 && byTable[p.tableNumber]) {
      byTable[p.tableNumber].push(id);
    }
  });

  // 各テーブルから半数（切り捨て）をランダムに抜き出す
  const movers: string[] = [];
  const stayers: Record<number, string[]> = {};
  for (let t = 1; t <= tableCount; t++) {
    const members = shuffleArray([...byTable[t]]);
    const moveCount = Math.floor(members.length / 2);
    movers.push(...members.slice(0, moveCount));
    stayers[t] = members.slice(moveCount);
  }

  // 移動者をシャッフルして、元のテーブル以外に配分
  shuffleArray(movers);

  // 各テーブルの空き枠を計算（均等配分を目指す）
  const totalPlayers = Object.values(byTable).reduce((s, arr) => s + arr.length, 0);
  const targetPerTable = Math.ceil(totalPlayers / tableCount);

  const updates: Record<string, number> = {};

  // 移動者を空きの多いテーブルから順に埋める（元テーブルを避ける）
  const originalTable: Record<string, number> = {};
  Object.entries(room.players).forEach(([id, p]) => {
    if (p.tableNumber > 0) originalTable[id] = p.tableNumber;
  });

  const currentCounts: Record<number, number> = {};
  for (let t = 1; t <= tableCount; t++) currentCounts[t] = stayers[t].length;

  for (const id of movers) {
    // 空きが最も多いテーブルを選ぶ（元テーブルは最後の手段）
    const candidates = Array.from({ length: tableCount }, (_, i) => i + 1)
      .filter((t) => t !== originalTable[id] && currentCounts[t] < targetPerTable);

    let dest: number;
    if (candidates.length > 0) {
      dest = candidates.reduce((a, b) => currentCounts[a] <= currentCounts[b] ? a : b);
    } else {
      // 全テーブル満杯 or 元テーブルしかない場合、一番空いてるところへ
      dest = Array.from({ length: tableCount }, (_, i) => i + 1)
        .reduce((a, b) => currentCounts[a] <= currentCounts[b] ? a : b);
    }

    updates[`players/${id}/tableNumber`] = dest;
    currentCounts[dest]++;
  }

  if (Object.keys(updates).length > 0) {
    const roomRef = ref(getDb(), `rooms/${roomId}`);
    await update(roomRef, updates);
  }
}

// ========== 色グループスコア計算（くるっくりん用） ==========

const COLOR_GROUP_SCORE = [0, 0, 3, 5, 7, 12, 19]; // index=サイズ, 孤立=0, 6+=19

export function calculateColorScore(rows: number[][], colors: string[][]): number {
  const numRows = rows.length;
  if (numRows === 0) return 0;

  let totalScore = 0;

  // 横方向: 各行で同色の連続グループを計算
  for (let ri = 0; ri < numRows; ri++) {
    let ci = 0;
    while (ci < rows[ri].length) {
      const color = colors[ri]?.[ci];
      if (!color) { ci++; continue; }

      // 同色の連続をカウント
      let groupSize = 1;
      while (ci + groupSize < rows[ri].length && colors[ri]?.[ci + groupSize] === color) {
        groupSize++;
      }

      totalScore += groupSize >= 6 ? 19 : COLOR_GROUP_SCORE[groupSize];
      ci += groupSize;
    }
  }

  // 縦方向: 各列で3行全て同色なら +ボーナス（1本目3pt, 2本目4pt, 3本目5pt...）
  const numCols = Math.max(...rows.map((r) => r.length));
  if (numRows === 3) {
    let verticalCount = 0;
    for (let ci = 0; ci < numCols; ci++) {
      const c0 = colors[0]?.[ci];
      if (c0 && c0 === colors[1]?.[ci] && c0 === colors[2]?.[ci]) {
        verticalCount++;
        totalScore += 2 + verticalCount; // 3, 4, 5, 6, ...
      }
    }
  }

  return totalScore;
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

  const isKrukkurin = gameType === "krukkurin";

  // 全参加者分のボードを初期化
  Object.keys(room.players).forEach((pid) => {
    boards[pid] = {
      rows: createEmptyBoard(gameType),
      ...(isKrukkurin ? { colors: createEmptyColors(gameType) } : {}),
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
  const gameType = room.currentGame.type;
  const isKrukkurin = gameType === "krukkurin";
  const cardsNeeded = isKrukkurin ? 2 : 1;

  const nextIdx = streams.currentCardIdx + cardsNeeded;
  if (nextIdx >= streams.deck.length) return;

  const updates: Record<string, unknown> = {};

  if (isKrukkurin) {
    const num1 = streams.deck[streams.currentCardIdx + 1];
    const num2 = streams.deck[streams.currentCardIdx + 2];
    const color1 = KRUKKURIN_CARD_COLORS[Math.floor(Math.random() * KRUKKURIN_CARD_COLORS.length)];
    const color2 = KRUKKURIN_CARD_COLORS[Math.floor(Math.random() * KRUKKURIN_CARD_COLORS.length)];

    const card = {
      number: num1,
      points: 0,
      items: [
        { number: num1, color: color1 },
        { number: num2, color: color2 },
      ],
      flippedAt: Date.now(),
    };

    updates["currentGame/streams/currentCardIdx"] = nextIdx;
    updates["currentGame/streams/currentCard"] = card;

    const history = streams.history || [];
    updates["currentGame/streams/history"] = [...history, card];

    // 全員の acted をリセット
    if (room.currentGame.boards) {
      Object.entries(room.currentGame.boards).forEach(([pid, board]) => {
        if (!board.eliminated && !board.completed) {
          updates[`currentGame/boards/${pid}/acted`] = false;
        }
      });
    }
  } else {
    // meta_streams
    const number = streams.deck[streams.currentCardIdx + 1];
    const points = Math.floor(Math.random() * 18) + 1;
    const card = { number, points, flippedAt: Date.now() };

    updates["currentGame/streams/currentCardIdx"] = nextIdx;
    updates["currentGame/streams/currentCard"] = card;

    const history = streams.history || [];
    updates["currentGame/streams/history"] = [...history, card];

    if (room.currentGame.boards) {
      Object.entries(room.currentGame.boards).forEach(([pid, board]) => {
        if (!board.eliminated && !board.completed) {
          updates[`currentGame/boards/${pid}/acted`] = false;
        }
      });
    }
  }

  const roomRef = ref(getDb(), `rooms/${roomId}`);
  await update(roomRef, updates);
}

// 最後の生存者ボーナス（+10pt）
function applyLastSurvivorBonus(
  boards: Record<string, PlayerBoard>,
  leavingPlayerId: string,
  updates: Record<string, unknown>,
): void {
  const active = Object.entries(boards).filter(
    ([pid, b]) => pid !== leavingPlayerId && !b.eliminated && !b.completed,
  );
  if (active.length === 1) {
    const [survivorId, survivorBoard] = active[0];
    updates[`currentGame/boards/${survivorId}/score`] = survivorBoard.score + 10;
    updates[`currentGame/boards/${survivorId}/completed`] = true;
  }
}

// カードを配置
export async function placeCard(
  roomId: string,
  playerId: string,
  rowIndex: number,
  slotIndex: number,
  itemIndex?: number,  // くるっくりん用: 配置するアイテム (0 or 1)
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
  const isKrukkurin = gameType === "krukkurin";
  const rows = board.rows;

  // バリデーション: 指定マスが空か
  if (!rows[rowIndex] || rows[rowIndex][slotIndex] === undefined) {
    return { success: false, error: "無効なマス位置です" };
  }
  if (rows[rowIndex][slotIndex] !== 0) {
    return { success: false, error: "そのマスは空いていません" };
  }

  // 配置する数字を決定
  let placeNumber: number;
  let placeColor = "";

  if (isKrukkurin) {
    if (itemIndex === undefined || !card.items?.[itemIndex]) {
      return { success: false, error: "無効なアイテムです" };
    }
    placeNumber = card.items[itemIndex].number;
    placeColor = card.items[itemIndex].color;
  } else {
    placeNumber = card.number;
  }

  // 昇順バリデーション
  const row = rows[rowIndex];
  let leftVal = 0;
  for (let i = slotIndex - 1; i >= 0; i--) {
    if (row[i] !== 0) { leftVal = row[i]; break; }
  }
  if (leftVal !== 0 && leftVal > placeNumber) {
    return { success: false, error: "昇順ルール違反です（左の値より小さい）" };
  }
  let rightVal = 0;
  for (let i = slotIndex + 1; i < row.length; i++) {
    if (row[i] !== 0) { rightVal = row[i]; break; }
  }
  if (rightVal !== 0 && rightVal < placeNumber) {
    return { success: false, error: "昇順ルール違反です（右の値より大きい）" };
  }

  // 配置実行
  const newRows = rows.map((r) => [...r]);
  newRows[rowIndex][slotIndex] = placeNumber;
  const allFilled = newRows.every((r) => r.every((v) => v !== 0));

  const updates: Record<string, unknown> = {
    [`currentGame/boards/${playerId}/rows`]: newRows,
    [`currentGame/boards/${playerId}/completed`]: allFilled,
  };

  if (isKrukkurin) {
    // 色配置 + スコア再計算
    const newColors = (board.colors || createEmptyColors(gameType)).map((r: string[]) => [...r]);
    newColors[rowIndex][slotIndex] = placeColor;
    const colorScore = calculateColorScore(newRows, newColors);
    updates[`currentGame/boards/${playerId}/colors`] = newColors;
    updates[`currentGame/boards/${playerId}/score`] = colorScore - board.passCount;
    updates[`currentGame/boards/${playerId}/acted`] = true;
  } else {
    // meta_streams: 従来のポイント加算
    updates[`currentGame/boards/${playerId}/score`] = board.score + card.points;
    updates[`currentGame/boards/${playerId}/acted`] = true;
  }

  if (allFilled) {
    applyLastSurvivorBonus(room.currentGame.boards, playerId, updates);
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

  const gameType = room.currentGame.type;
  const isKrukkurin = gameType === "krukkurin";
  const newPassCount = board.passCount + 1;
  const isEliminated = newPassCount >= 4;

  const updates: Record<string, unknown> = {
    [`currentGame/boards/${playerId}/passCount`]: newPassCount,
    [`currentGame/boards/${playerId}/score`]: board.score - 1,
    [`currentGame/boards/${playerId}/acted`]: true,
    [`currentGame/boards/${playerId}/eliminated`]: isEliminated,
  };

  if (isEliminated) {
    applyLastSurvivorBonus(room.currentGame.boards, playerId, updates);
  }

  const roomRef = ref(getDb(), `rooms/${roomId}`);
  await update(roomRef, updates);
  return { success: true };
}
