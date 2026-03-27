import { getDatabases, getClient, DATABASE_ID, COLLECTION_ROOMS, COLLECTION_PLAYERS, COLLECTION_ANSWERS } from "./appwrite";
import { ID, Query } from "appwrite";
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

// ===== ヘルパー =====

function parseJson<T>(value: string | null | undefined): T | undefined {
  if (!value || value === "") return undefined;
  try { return JSON.parse(value); }
  catch { return undefined; }
}

function toJson(value: unknown): string {
  if (value === undefined || value === null) return "";
  return JSON.stringify(stripUndefined(value));
}

// undefinedを再帰的に除去
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

// ドキュメント → Player 変換
function docToPlayer(doc: Record<string, unknown>): Player {
  return {
    name: doc.name as string,
    tableNumber: doc.tableNumber as number,
    connected: doc.connected as boolean,
    joinedAt: doc.joinedAt as number,
    fields: parseJson<Record<string, string | number>>(doc.fields as string) || {},
  };
}

// RoomData: dataフィールドに格納する型（players, answers除く）
interface RoomData {
  config: RoomConfig;
  state: RoomState;
  scenario?: { steps: ScenarioStep[] };
  currentGame?: CurrentGame;
  messages?: Record<string, AdminMessage>;
  gameResults?: Record<string, GameResult>;
  stepResponses?: Record<string, Record<string, StepResponse>>;
  stepReveals?: Record<string, StepInputReveal>;
  revealVisibility?: Record<string, Record<string, boolean>>;
  publishedTables?: { assignments: Record<string, number>; pushedAt: number };
  publishHistory?: Record<string, { pushedAt: number; assignments: Record<string, number> }>;
}

// ドキュメントからRoomDataをパース
function parseRoomData(doc: Record<string, unknown>): RoomData | null {
  const data = parseJson<RoomData>(doc.data as string);
  if (!data) return null;
  if (doc.creatorUid) data.config.creatorUid = doc.creatorUid as string;
  return data;
}

// Room ドキュメント + players + answers → Room オブジェクト組み立て
function assembleRoom(
  doc: Record<string, unknown>,
  players: Record<string, Player>,
  answers: Record<string, Record<string, Answer>>,
): Room {
  const data = parseRoomData(doc)!;

  let currentGame = data.currentGame;
  if (currentGame && Object.keys(answers).length > 0) {
    currentGame = { ...currentGame, answers };
  }

  return {
    config: data.config,
    state: data.state,
    scenario: data.scenario,
    players: Object.keys(players).length > 0 ? players : undefined,
    currentGame,
    messages: data.messages,
    gameResults: data.gameResults,
    stepResponses: data.stepResponses,
    stepReveals: data.stepReveals,
    revealVisibility: data.revealVisibility,
    publishedTables: data.publishedTables,
    publishHistory: data.publishHistory,
  };
}

// RoomDataを読み取って更新するヘルパー
async function updateRoomData(
  roomId: string,
  updater: (data: RoomData) => void,
): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const data = parseRoomData(doc);
  if (!data) return;
  updater(data);
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    data: toJson(data),
  });
}

// Room ドキュメントだけ取得（内部用）
async function getRoomDoc(roomId: string): Promise<Record<string, unknown> | null> {
  try {
    return await getDatabases().getDocument(DATABASE_ID, COLLECTION_ROOMS, roomId) as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

// players をフェッチ
async function fetchPlayers(roomId: string): Promise<Record<string, Player>> {
  const players: Record<string, Player> = {};
  try {
    const res = await getDatabases().listDocuments(DATABASE_ID, COLLECTION_PLAYERS, [
      Query.equal("roomId", roomId), Query.limit(500),
    ]);
    for (const doc of res.documents) {
      players[doc.$id] = docToPlayer(doc as unknown as Record<string, unknown>);
    }
  } catch { /* empty */ }
  return players;
}

// answers をフェッチ
async function fetchAnswers(roomId: string): Promise<Record<string, Record<string, Answer>>> {
  const answers: Record<string, Record<string, Answer>> = {};
  try {
    const res = await getDatabases().listDocuments(DATABASE_ID, COLLECTION_ANSWERS, [
      Query.equal("roomId", roomId), Query.limit(5000),
    ]);
    for (const doc of res.documents) {
      const d = doc as unknown as Record<string, unknown>;
      const qId = d.questionId as string;
      const pId = d.playerId as string;
      if (!answers[qId]) answers[qId] = {};
      answers[qId][pId] = { text: d.text as string, submittedAt: d.submittedAt as number };
    }
  } catch { /* empty */ }
  return answers;
}

// 関連ドキュメント一括削除
async function deleteAllInCollection(collectionId: string, roomId: string): Promise<void> {
  const db = getDatabases();
  let hasMore = true;
  while (hasMore) {
    const res = await db.listDocuments(DATABASE_ID, collectionId, [
      Query.equal("roomId", roomId), Query.limit(100),
    ]);
    if (res.documents.length === 0) break;
    await Promise.all(res.documents.map(d => db.deleteDocument(DATABASE_ID, collectionId, d.$id)));
    if (res.documents.length < 100) hasMore = false;
  }
}

// ===== ルームID生成 =====

export function generateRoomId(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
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

// ===== CRUD =====

export async function createRoom(
  eventName: string,
  eventDate: string,
  adminPassword: string,
  creatorUid?: string,
): Promise<string> {
  const roomId = generateRoomId();

  const config: RoomConfig = {
    eventName,
    eventDate,
    tableCount: 6,
    createdAt: Date.now(),
    adminPassword,
    creatorUid,
    entryFields: [
      { id: "name", label: "名前", type: "text", required: true },
    ],
  };

  const state: RoomState = {
    currentStep: 0,
    phase: "waiting",
    stepTimestamps: { s0: Date.now() },
  };

  const roomData: RoomData = {
    config,
    state,
    scenario: { steps: DEFAULT_SCENARIO_STEPS },
  };

  await getDatabases().createDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    creatorUid: creatorUid || "",
    data: toJson(roomData),
  });

  return roomId;
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return null;

  const [players, answers] = await Promise.all([
    fetchPlayers(roomId),
    fetchAnswers(roomId),
  ]);

  return assembleRoom(doc, players, answers);
}

export async function getRoomsByCreator(uid: string): Promise<{ id: string; room: Room }[]> {
  const db = getDatabases();
  const res = await db.listDocuments(DATABASE_ID, COLLECTION_ROOMS, [
    Query.equal("creatorUid", uid), Query.limit(100),
  ]);

  return res.documents
    .map(doc => {
      const d = doc as unknown as Record<string, unknown>;
      const data = parseRoomData(d);
      if (!data) return null;
      return { id: doc.$id, room: { config: data.config, state: data.state } as Room };
    })
    .filter((r): r is { id: string; room: Room } => r !== null)
    .sort((a, b) => b.room.config.createdAt - a.room.config.createdAt);
}

export async function deleteRoom(roomId: string): Promise<void> {
  await Promise.all([
    getDatabases().deleteDocument(DATABASE_ID, COLLECTION_ROOMS, roomId).catch(() => {}),
    deleteAllInCollection(COLLECTION_PLAYERS, roomId),
    deleteAllInCollection(COLLECTION_ANSWERS, roomId),
  ]);
}

// ===== リアルタイム購読 =====

export function subscribeToRoom(
  roomId: string,
  callback: (room: Room | null) => void,
): () => void {
  const client = getClient();
  const db = getDatabases();

  let roomDoc: Record<string, unknown> | null = null;
  let players: Record<string, Player> = {};
  let answers: Record<string, Record<string, Answer>> = {};
  let initialized = false;

  function emit() {
    if (!initialized) return;
    if (!roomDoc) { callback(null); return; }
    callback(assembleRoom(roomDoc, players, answers));
  }

  // ルームドキュメント購読
  const unsub1 = client.subscribe(
    `databases.${DATABASE_ID}.collections.${COLLECTION_ROOMS}.documents.${roomId}`,
    (event) => {
      if (event.events.some((e: string) => e.includes(".delete"))) {
        roomDoc = null;
      } else {
        roomDoc = event.payload as unknown as Record<string, unknown>;
      }
      emit();
    },
  );

  // プレイヤー購読
  const unsub2 = client.subscribe(
    `databases.${DATABASE_ID}.collections.${COLLECTION_PLAYERS}.documents`,
    (event) => {
      const doc = event.payload as unknown as Record<string, unknown>;
      if (doc.roomId !== roomId) return;
      const id = (doc as unknown as { $id: string }).$id;
      if (event.events.some((e: string) => e.includes(".delete"))) {
        delete players[id];
      } else {
        players[id] = docToPlayer(doc);
      }
      players = { ...players };
      emit();
    },
  );

  // 回答購読
  const unsub3 = client.subscribe(
    `databases.${DATABASE_ID}.collections.${COLLECTION_ANSWERS}.documents`,
    (event) => {
      const doc = event.payload as unknown as Record<string, unknown>;
      if (doc.roomId !== roomId) return;
      const qId = doc.questionId as string;
      const pId = doc.playerId as string;
      if (event.events.some((e: string) => e.includes(".delete"))) {
        if (answers[qId]) {
          delete answers[qId][pId];
          if (Object.keys(answers[qId]).length === 0) delete answers[qId];
        }
      } else {
        if (!answers[qId]) answers[qId] = {};
        answers[qId][pId] = { text: doc.text as string, submittedAt: doc.submittedAt as number };
      }
      answers = { ...answers };
      emit();
    },
  );

  // 初回フェッチ
  (async () => {
    try {
      roomDoc = await db.getDocument(DATABASE_ID, COLLECTION_ROOMS, roomId) as unknown as Record<string, unknown>;
    } catch {
      roomDoc = null;
    }
    const [p, a] = await Promise.all([fetchPlayers(roomId), fetchAnswers(roomId)]);
    players = p;
    answers = a;
    initialized = true;
    emit();
  })();

  return () => { unsub1(); unsub2(); unsub3(); };
}

// 参加者一覧の購読
export function subscribeToPlayers(
  roomId: string,
  callback: (players: Record<string, Player> | null) => void,
): () => void {
  const client = getClient();
  let players: Record<string, Player> = {};

  const unsub = client.subscribe(
    `databases.${DATABASE_ID}.collections.${COLLECTION_PLAYERS}.documents`,
    (event) => {
      const doc = event.payload as unknown as Record<string, unknown>;
      if (doc.roomId !== roomId) return;
      const id = (doc as unknown as { $id: string }).$id;
      if (event.events.some((e: string) => e.includes(".delete"))) {
        delete players[id];
      } else {
        players[id] = docToPlayer(doc);
      }
      players = { ...players };
      callback(Object.keys(players).length > 0 ? players : null);
    },
  );

  // 初回フェッチ
  fetchPlayers(roomId).then(p => {
    players = p;
    callback(Object.keys(players).length > 0 ? players : null);
  });

  return unsub;
}

// 個別参加者の購読
export function subscribeToPlayer(
  roomId: string,
  playerId: string,
  callback: (player: Player | null) => void,
): () => void {
  const client = getClient();

  const unsub = client.subscribe(
    `databases.${DATABASE_ID}.collections.${COLLECTION_PLAYERS}.documents.${playerId}`,
    (event) => {
      if (event.events.some((e: string) => e.includes(".delete"))) {
        callback(null);
      } else {
        callback(docToPlayer(event.payload as unknown as Record<string, unknown>));
      }
    },
  );

  // 初回フェッチ
  getDatabases().getDocument(DATABASE_ID, COLLECTION_PLAYERS, playerId)
    .then(doc => callback(docToPlayer(doc as unknown as Record<string, unknown>)))
    .catch(() => callback(null));

  return unsub;
}

// メッセージ購読（roomドキュメントのmessages属性を監視）
export function subscribeToMessages(
  roomId: string,
  callback: (messages: Record<string, AdminMessage> | null) => void,
): () => void {
  const client = getClient();

  const unsub = client.subscribe(
    `databases.${DATABASE_ID}.collections.${COLLECTION_ROOMS}.documents.${roomId}`,
    (event) => {
      const doc = event.payload as unknown as Record<string, unknown>;
      const data = parseRoomData(doc);
      callback(data?.messages || null);
    },
  );

  getRoomDoc(roomId).then(doc => {
    if (!doc) { callback(null); return; }
    const data = parseRoomData(doc);
    callback(data?.messages || null);
  });

  return unsub;
}

// ステップ回答の購読
export function subscribeToStepResponses(
  roomId: string,
  stepIndex: number,
  callback: (responses: Record<string, StepResponse> | null) => void,
): () => void {
  const client = getClient();
  const key = String(stepIndex);

  const unsub = client.subscribe(
    `databases.${DATABASE_ID}.collections.${COLLECTION_ROOMS}.documents.${roomId}`,
    (event) => {
      const doc = event.payload as unknown as Record<string, unknown>;
      const data = parseRoomData(doc);
      callback(data?.stepResponses?.[key] || null);
    },
  );

  getRoomDoc(roomId).then(doc => {
    if (!doc) { callback(null); return; }
    const data = parseRoomData(doc);
    callback(data?.stepResponses?.[key] || null);
  });

  return unsub;
}

// ===== 台本操作 =====

export async function updateScenario(roomId: string, steps: ScenarioStep[]): Promise<void> {
  await updateRoomData(roomId, d => { d.scenario = { steps }; });
}

export async function addScenarioStep(roomId: string, step: ScenarioStep): Promise<void> {
  await updateRoomData(roomId, d => {
    const steps = d.scenario?.steps || [];
    steps.push(step);
    d.scenario = { steps };
  });
}

// ===== ステート更新 =====

export async function updateRoomState(roomId: string, state: Partial<RoomState>): Promise<void> {
  await updateRoomData(roomId, d => { d.state = { ...d.state, ...state }; });
}

// 次のステップへ
export async function goToNextStep(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) return;

  const currentStep = room.state.currentStep;
  const totalSteps = room.scenario?.steps?.length || 0;
  if (currentStep >= totalSteps - 1) return;

  const nextStep = currentStep + 1;

  // ゲーム結果の計算（answersが必要なので先にやる）
  let gameResult: GameResult | undefined;
  const currentStepDef = room.scenario?.steps?.[currentStep];
  if (currentStepDef && (currentStepDef.type === "table_game" || currentStepDef.type === "whole_game") && room.currentGame) {
    const cg = room.currentGame;
    const isStreamsGame = cg.type === "krukkurin" || cg.type === "meta_streams";

    if (isStreamsGame) {
      const scores: Record<string, number> = {};
      if (cg.boards) {
        Object.entries(cg.boards).forEach(([pid, board]) => { scores[pid] = board.score || 0; });
      }
      gameResult = { type: cg.type, scope: cg.scope, questions: {}, answers: {}, scores, completedAt: Date.now(), streamsHistory: cg.streams?.history || [], boards: cg.boards || {} };
    } else {
      const { calculateTotalScores } = await import("./scoring");
      let scores: Record<string, number>;
      if (cg.scope === "table") {
        const assignments = room.publishedTables?.assignments || {};
        const tableNumbers = [...new Set(Object.values(assignments))];
        scores = {};
        for (const tNum of tableNumbers) {
          const tableScores = calculateTotalScores(cg.type, cg.answers || {}, "table", tNum, assignments);
          Object.entries(tableScores).forEach(([pid, score]) => { scores[pid] = (scores[pid] || 0) + score; });
        }
      } else {
        scores = calculateTotalScores(cg.type, cg.answers || {}, cg.scope);
      }
      gameResult = { type: cg.type, scope: cg.scope, questions: cg.questions || {}, answers: cg.answers || {}, scores, completedAt: Date.now() };
    }
  }

  await updateRoomData(roomId, d => {
    d.state = { ...d.state, currentStep: nextStep, phase: "waiting", stepTimestamps: { ...d.state.stepTimestamps, [`s${nextStep}`]: Date.now() } };
    d.currentGame = undefined;
    if (gameResult) {
      if (!d.gameResults) d.gameResults = {};
      d.gameResults[String(currentStep)] = gameResult;
    }
  });
  await deleteAllInCollection(COLLECTION_ANSWERS, roomId);
}

// 前のステップへ
export async function goToPrevStep(roomId: string): Promise<void> {
  await updateRoomData(roomId, d => {
    if (d.state.currentStep <= 0) return;
    const prevStep = d.state.currentStep - 1;
    d.state = { ...d.state, currentStep: prevStep, phase: "waiting", stepTimestamps: { ...d.state.stepTimestamps, [`s${prevStep}`]: Date.now() } };
  });
}

export async function setPhase(roomId: string, phase: Phase): Promise<void> {
  await updateRoomState(roomId, { phase });
}

// ===== ゲーム操作 =====

export async function startGame(roomId: string, gameType: GameType, scope: "table" | "whole", autoProgress: boolean, anonymousMode?: boolean): Promise<void> {
  await updateRoomData(roomId, d => {
    d.currentGame = { type: gameType, scope, autoProgress, anonymousMode: anonymousMode || undefined };
    d.state = { ...d.state, phase: "playing" };
  });
}

export async function advanceTableProgress(roomId: string, tableKey: string, nextIndex: number): Promise<void> {
  await updateRoomData(roomId, d => {
    if (!d.currentGame) return;
    if (!d.currentGame.tableProgress) d.currentGame.tableProgress = {};
    d.currentGame.tableProgress[tableKey] = nextIndex;
  });
}

export async function advanceGameProgress(roomId: string, nextIndex: number): Promise<void> {
  await updateRoomData(roomId, d => { if (d.currentGame) d.currentGame.currentQuestionIdx = nextIndex; });
}

export async function startGameWithAutoProgress(roomId: string, gameType: GameType, presetQuestions: GameQuestionConfig[], anonymousMode?: boolean): Promise<void> {
  const questions: Record<string, Question> = {};
  const questionOrder: string[] = [];
  const now = Date.now();
  presetQuestions.forEach((pq, i) => {
    const qId = `q_${now}_${i}`;
    const q: Question = { text: pq.text, timeLimit: 0, status: "open", inputType: pq.inputType, sentAt: now + i };
    if (pq.inputType === "select" && pq.options) q.options = pq.options.filter(o => o.trim());
    questions[qId] = q;
    questionOrder.push(qId);
  });
  await updateRoomData(roomId, d => {
    d.currentGame = { type: gameType, scope: "table", autoProgress: true, anonymousMode: anonymousMode || undefined, questions, questionOrder, tableProgress: {}, activeQuestionId: questionOrder[0], sentQuestionIndices: presetQuestions.map((_, i) => i) };
    d.state = { ...d.state, phase: "playing" };
  });
}

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

  if (currentIdx >= questionOrder.length) return false;
  if (questionOrder[currentIdx] !== questionId) return false;

  const assignments = room.publishedTables?.assignments || {};
  const tablePlayers = Object.entries(assignments)
    .filter(([pid, tNum]) => tNum === tableNumber && room.players?.[pid])
    .map(([pid]) => pid);

  if (tablePlayers.length === 0) return false;

  const answersForQ = room.currentGame.answers?.[questionId] || {};
  const allAnswered = tablePlayers.every(pid => pid in answersForQ);
  if (!allAnswered) return false;

  await advanceTableProgress(roomId, tableKey, currentIdx + 1);
  return true;
}

export async function forceAdvanceTable(roomId: string, tableNumber: number): Promise<void> {
  await updateRoomData(roomId, d => {
    if (!d.currentGame?.questionOrder) return;
    const tableKey = `table_${tableNumber}`;
    const currentIdx = d.currentGame.tableProgress?.[tableKey] ?? 0;
    if (currentIdx < d.currentGame.questionOrder.length) {
      if (!d.currentGame.tableProgress) d.currentGame.tableProgress = {};
      d.currentGame.tableProgress[tableKey] = currentIdx + 1;
    }
  });
}

export async function forceAdvanceAllTables(roomId: string, targetIndex: number): Promise<void> {
  await updateRoomData(roomId, d => {
    if (!d.currentGame?.questionOrder) return;
    if (!d.currentGame.tableProgress) d.currentGame.tableProgress = {};
    for (let t = 1; t <= d.config.tableCount; t++) {
      const tableKey = `table_${t}`;
      const currentIdx = d.currentGame.tableProgress[tableKey] ?? 0;
      if (currentIdx < targetIndex) d.currentGame.tableProgress[tableKey] = targetIndex;
    }
  });
}

// ===== お題操作 =====

export async function sendQuestion(roomId: string, text: string, inputType: "text" | "number" | "select" = "text", options?: string[], presetIndex?: number): Promise<void> {
  await updateRoomData(roomId, d => {
    if (!d.currentGame) d.currentGame = {} as CurrentGame;
    const questionId = `q_${Date.now()}`;
    const question: Question = inputType === "select" && options
      ? { text, timeLimit: 0, status: "open", inputType, options, sentAt: Date.now() }
      : { text, timeLimit: 0, status: "open", inputType, sentAt: Date.now() };
    if (!d.currentGame.questions) d.currentGame.questions = {};
    d.currentGame.questions[questionId] = question;
    d.currentGame.activeQuestionId = questionId;
    if (presetIndex !== undefined) {
      const currentSent = d.currentGame.sentQuestionIndices || [];
      if (!currentSent.includes(presetIndex)) d.currentGame.sentQuestionIndices = [...currentSent, presetIndex];
    }
  });
}

export async function reopenQuestion(roomId: string, questionId: string): Promise<void> {
  await updateRoomData(roomId, d => { if (d.currentGame?.questions?.[questionId]) d.currentGame.questions[questionId].status = "open"; });
}

export async function hideAnswers(roomId: string, questionId: string): Promise<void> {
  await updateRoomData(roomId, d => {
    if (!d.currentGame?.questions?.[questionId]) return;
    d.currentGame.questions[questionId].status = "closed";
    delete d.currentGame.questions[questionId].revealScope;
  });
}

export async function closeQuestion(roomId: string, questionId?: string): Promise<void> {
  await updateRoomData(roomId, d => {
    if (!d.currentGame) return;
    const targetId = questionId || d.currentGame.activeQuestionId;
    if (targetId && d.currentGame.questions?.[targetId]) d.currentGame.questions[targetId].status = "closed";
  });
}

export async function revealAnswers(roomId: string, questionId?: string, revealScope?: AnswerRevealScope): Promise<void> {
  await updateRoomData(roomId, d => {
    if (!d.currentGame) return;
    const targetId = questionId || d.currentGame.activeQuestionId;
    if (!targetId || !d.currentGame.questions?.[targetId]) return;
    d.currentGame.questions[targetId].status = "revealed";
    if (revealScope) d.currentGame.questions[targetId].revealScope = revealScope;
  });
}

export async function resetCurrentGame(roomId: string): Promise<void> {
  await updateRoomData(roomId, d => {
    if (d.currentGame) { delete d.currentGame.questions; delete d.currentGame.answers; delete d.currentGame.activeQuestionId; delete d.currentGame.sentQuestionIndices; }
  });
  await deleteAllInCollection(COLLECTION_ANSWERS, roomId);
}

export async function toggleScoreboard(roomId: string, show: boolean): Promise<void> {
  await updateRoomData(roomId, d => { if (d.currentGame) d.currentGame.showScoreboard = show || undefined; });
}

export async function saveGameResult(roomId: string, stepIndex: number, gameResult: GameResult): Promise<void> {
  await updateRoomData(roomId, d => { if (!d.gameResults) d.gameResults = {}; d.gameResults[String(stepIndex)] = gameResult; });
}

// ===== 設定更新 =====

async function updateConfig(roomId: string, updater: (config: RoomConfig) => void): Promise<void> {
  await updateRoomData(roomId, d => { updater(d.config); });
}

export async function updateTableCount(roomId: string, count: number): Promise<void> {
  await updateConfig(roomId, c => { c.tableCount = count; });
}

export async function updateAdminName(roomId: string, name: string): Promise<void> {
  await updateConfig(roomId, c => { c.adminName = name || undefined; });
}

export async function updateEventName(roomId: string, name: string): Promise<void> {
  await updateConfig(roomId, c => { c.eventName = name; });
}

export async function updateEventDate(roomId: string, date: string): Promise<void> {
  await updateConfig(roomId, c => { c.eventDate = date; });
}

export async function updateEntryFields(roomId: string, fields: EntryField[]): Promise<void> {
  await updateConfig(roomId, c => { c.entryFields = fields; });
}

export async function updateRoomConfigField(roomId: string, field: string, value: unknown): Promise<void> {
  await updateConfig(roomId, c => { (c as unknown as Record<string, unknown>)[field] = value; });
}

// ===== プレイヤー操作 =====

export async function addPlayer(roomId: string, playerData: Omit<Player, "connected" | "joinedAt">): Promise<string> {
  const doc = await getDatabases().createDocument(DATABASE_ID, COLLECTION_PLAYERS, ID.unique(), {
    roomId,
    name: playerData.name,
    tableNumber: playerData.tableNumber,
    connected: true,
    joinedAt: Date.now(),
    fields: toJson(playerData.fields),
  });
  return doc.$id;
}

export async function updatePlayerTable(roomId: string, playerId: string, tableNumber: number): Promise<void> {
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_PLAYERS, playerId, { tableNumber });
}

export async function updatePlayerFields(
  roomId: string,
  playerId: string,
  fields: Record<string, string | number>,
): Promise<void> {
  const doc = await getDatabases().getDocument(DATABASE_ID, COLLECTION_PLAYERS, playerId);
  const current = parseJson<Record<string, string | number>>((doc as unknown as Record<string, unknown>).fields as string) || {};
  const merged = { ...current, ...fields };
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_PLAYERS, playerId, {
    fields: toJson(merged),
  });
}

export async function removePlayer(roomId: string, playerId: string): Promise<void> {
  await getDatabases().deleteDocument(DATABASE_ID, COLLECTION_PLAYERS, playerId).catch(() => {});
}

// ===== メッセージ =====

export async function sendAdminMessage(roomId: string, text: string, target: MessageTarget, currentStep: number): Promise<void> {
  await updateRoomData(roomId, d => {
    if (!d.messages) d.messages = {};
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    d.messages[msgId] = { id: msgId, text, target, sentAt: Date.now(), sentDuringStep: currentStep };
  });
}

// ===== ステップ回答 =====

export async function submitStepResponse(roomId: string, stepIndex: number, playerId: string, value: string | number, playerName: string, tableNumber: number): Promise<void> {
  await updateRoomData(roomId, d => {
    if (!d.stepResponses) d.stepResponses = {};
    const key = String(stepIndex);
    if (!d.stepResponses[key]) d.stepResponses[key] = {};
    d.stepResponses[key][playerId] = { value, submittedAt: Date.now(), playerName, tableNumber };
  });
}

export async function setStepReveal(roomId: string, stepIndex: number, reveal: StepInputReveal): Promise<void> {
  await updateRoomData(roomId, d => { if (!d.stepReveals) d.stepReveals = {}; d.stepReveals[String(stepIndex)] = reveal; });
}

export async function clearStepReveal(roomId: string, stepIndex: number): Promise<void> {
  await updateRoomData(roomId, d => { if (d.stepReveals) delete d.stepReveals[String(stepIndex)]; });
}

export async function resetStepResponses(roomId: string, stepIndex: number): Promise<void> {
  await updateRoomData(roomId, d => { if (d.stepResponses) delete d.stepResponses[String(stepIndex)]; });
}

export async function resetStepAll(roomId: string, stepIndex: number): Promise<void> {
  await updateRoomData(roomId, d => {
    if (d.stepResponses) delete d.stepResponses[String(stepIndex)];
    if (d.stepReveals) delete d.stepReveals[String(stepIndex)];
  });
}

export async function setRevealQuestionVisibility(roomId: string, stepIndex: number, questionId: string, visible: boolean): Promise<void> {
  await updateRoomData(roomId, d => {
    if (!d.revealVisibility) d.revealVisibility = {};
    if (!d.revealVisibility[String(stepIndex)]) d.revealVisibility[String(stepIndex)] = {};
    d.revealVisibility[String(stepIndex)][questionId] = visible;
  });
}

// ===== ステップ割り込み =====

export async function insertStepAfterCurrent(roomId: string, newStep: ScenarioStep, autoAdvance: boolean): Promise<void> {
  await updateRoomData(roomId, d => {
    if (!d.scenario) return;
    const currentStep = d.state.currentStep;
    d.scenario.steps.splice(currentStep + 1, 0, newStep);
    if (autoAdvance) {
      d.state = { ...d.state, currentStep: currentStep + 1, phase: "waiting", stepTimestamps: { ...d.state.stepTimestamps, [`s${currentStep + 1}`]: Date.now() } };
    }
  });
}

// ===== プレゼンス =====

export function registerPresence(roomId: string, playerId: string): () => void {
  const db = getDatabases();

  // 接続時に connected = true
  db.updateDocument(DATABASE_ID, COLLECTION_PLAYERS, playerId, { connected: true }).catch(() => {});

  const handleBeforeUnload = () => {
    db.updateDocument(DATABASE_ID, COLLECTION_PLAYERS, playerId, { connected: false }).catch(() => {});
  };

  const handleVisibilityChange = () => {
    const connected = document.visibilityState === "visible";
    db.updateDocument(DATABASE_ID, COLLECTION_PLAYERS, playerId, { connected }).catch(() => {});
  };

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    db.updateDocument(DATABASE_ID, COLLECTION_PLAYERS, playerId, { connected: false }).catch(() => {});
  };
}

// ===== テーブル操作 =====

export async function publishTables(roomId: string): Promise<void> {
  const players = await fetchPlayers(roomId);
  if (Object.keys(players).length === 0) return;
  const assignments: Record<string, number> = {};
  Object.entries(players).forEach(([id, player]) => { assignments[id] = player.tableNumber; });
  const now = Date.now();
  await updateRoomData(roomId, d => {
    d.publishedTables = { assignments, pushedAt: now };
    if (!d.publishHistory) d.publishHistory = {};
    d.publishHistory[`pub_${now}`] = { pushedAt: now, assignments };
  });
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function shuffleTables(roomId: string): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const data = parseRoomData(doc);
  if (!data) return;
  const players = await fetchPlayers(roomId);

  const tableCount = data.config.tableCount || 1;
  const assignedIds = Object.entries(players)
    .filter(([, p]) => p.tableNumber > 0)
    .map(([id]) => id);

  shuffleArray(assignedIds);

  await Promise.all(
    assignedIds.map((id, idx) =>
      getDatabases().updateDocument(DATABASE_ID, COLLECTION_PLAYERS, id, {
        tableNumber: (idx % tableCount) + 1,
      })
    )
  );
}

export async function halfShuffleTables(roomId: string): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const data = parseRoomData(doc);
  if (!data) return;
  const players = await fetchPlayers(roomId);

  const tableCount = data.config.tableCount || 1;
  if (tableCount < 2) return;

  const byTable: Record<number, string[]> = {};
  for (let t = 1; t <= tableCount; t++) byTable[t] = [];
  Object.entries(players).forEach(([id, p]) => {
    if (p.tableNumber > 0 && byTable[p.tableNumber]) {
      byTable[p.tableNumber].push(id);
    }
  });

  const movers: string[] = [];
  const stayers: Record<number, string[]> = {};
  for (let t = 1; t <= tableCount; t++) {
    const members = shuffleArray([...byTable[t]]);
    const moveCount = Math.floor(members.length / 2);
    movers.push(...members.slice(0, moveCount));
    stayers[t] = members.slice(moveCount);
  }

  shuffleArray(movers);

  const totalPlayers = Object.values(byTable).reduce((s, arr) => s + arr.length, 0);
  const targetPerTable = Math.ceil(totalPlayers / tableCount);

  const originalTable: Record<string, number> = {};
  Object.entries(players).forEach(([id, p]) => {
    if (p.tableNumber > 0) originalTable[id] = p.tableNumber;
  });

  const currentCounts: Record<number, number> = {};
  for (let t = 1; t <= tableCount; t++) currentCounts[t] = stayers[t].length;

  const updates: { id: string; table: number }[] = [];
  for (const id of movers) {
    const candidates = Array.from({ length: tableCount }, (_, i) => i + 1)
      .filter(t => t !== originalTable[id] && currentCounts[t] < targetPerTable);

    let dest: number;
    if (candidates.length > 0) {
      dest = candidates.reduce((a, b) => currentCounts[a] <= currentCounts[b] ? a : b);
    } else {
      dest = Array.from({ length: tableCount }, (_, i) => i + 1)
        .reduce((a, b) => currentCounts[a] <= currentCounts[b] ? a : b);
    }

    updates.push({ id, table: dest });
    currentCounts[dest]++;
  }

  await Promise.all(
    updates.map(u =>
      getDatabases().updateDocument(DATABASE_ID, COLLECTION_PLAYERS, u.id, { tableNumber: u.table })
    )
  );
}

// ===== Streams系ゲーム =====

const COLOR_GROUP_SCORE = [0, 0, 3, 5, 7, 12, 19];

export function calculateColorScore(rows: number[][], colors: string[][]): number {
  const numRows = rows.length;
  if (numRows === 0) return 0;

  let totalScore = 0;

  for (let ri = 0; ri < numRows; ri++) {
    let ci = 0;
    while (ci < rows[ri].length) {
      const color = colors[ri]?.[ci];
      if (!color) { ci++; continue; }
      let groupSize = 1;
      while (ci + groupSize < rows[ri].length && colors[ri]?.[ci + groupSize] === color) {
        groupSize++;
      }
      totalScore += groupSize >= 6 ? 19 : COLOR_GROUP_SCORE[groupSize];
      ci += groupSize;
    }
  }

  const numCols = Math.max(...rows.map(r => r.length));
  if (numRows === 3) {
    let verticalCount = 0;
    for (let ci = 0; ci < numCols; ci++) {
      const c0 = colors[0]?.[ci];
      if (c0 && c0 === colors[1]?.[ci] && c0 === colors[2]?.[ci]) {
        verticalCount++;
        totalScore += 2 + verticalCount;
      }
    }
  }

  return totalScore;
}

export async function initStreamsGame(roomId: string, gameType: GameType): Promise<void> {
  const players = await fetchPlayers(roomId);
  if (Object.keys(players).length === 0) return;

  const deck = generateDeck(gameType);
  const boards: Record<string, PlayerBoard> = {};
  const isKrukkurin = gameType === "krukkurin";

  Object.keys(players).forEach(pid => {
    boards[pid] = {
      rows: createEmptyBoard(gameType),
      ...(isKrukkurin ? { colors: createEmptyColors(gameType) } : {}),
      passCount: 0, eliminated: false, completed: false, score: 0, acted: false,
    };
  });

  const game: CurrentGame = {
    type: gameType, scope: "whole", autoProgress: false,
    streams: { deck, currentCardIdx: -1, currentCard: null, history: [] },
    boards,
  };

  await updateRoomData(roomId, d => {
    d.currentGame = game;
    d.state = { ...d.state, phase: "playing" };
  });
}

export async function flipCard(roomId: string): Promise<void> {
  await updateRoomData(roomId, d => {
    const cg = d.currentGame;
    if (!cg?.streams) return;
    const streams = cg.streams;
    const isKrukkurin = cg.type === "krukkurin";
    const cardsNeeded = isKrukkurin ? 2 : 1;
    const nextIdx = streams.currentCardIdx + cardsNeeded;
    if (nextIdx >= streams.deck.length) return;

    if (isKrukkurin) {
      const num1 = streams.deck[streams.currentCardIdx + 1];
      const num2 = streams.deck[streams.currentCardIdx + 2];
      const color1 = KRUKKURIN_CARD_COLORS[Math.floor(Math.random() * KRUKKURIN_CARD_COLORS.length)];
      const color2 = KRUKKURIN_CARD_COLORS[Math.floor(Math.random() * KRUKKURIN_CARD_COLORS.length)];
      const card = { number: num1, points: 0, items: [{ number: num1, color: color1 }, { number: num2, color: color2 }], flippedAt: Date.now() };
      streams.currentCardIdx = nextIdx;
      streams.currentCard = card;
      streams.history = [...(streams.history || []), card];
    } else {
      const number = streams.deck[streams.currentCardIdx + 1];
      const points = Math.floor(Math.random() * 18) + 1;
      const card = { number, points, flippedAt: Date.now() };
      streams.currentCardIdx = nextIdx;
      streams.currentCard = card;
      streams.history = [...(streams.history || []), card];
    }
    if (cg.boards) { Object.values(cg.boards).forEach(board => { if (!board.eliminated && !board.completed) board.acted = false; }); }
  });
}

function applyLastSurvivorBonus(
  boards: Record<string, PlayerBoard>,
  leavingPlayerId: string,
): Record<string, PlayerBoard> {
  const active = Object.entries(boards).filter(
    ([pid, b]) => pid !== leavingPlayerId && !b.eliminated && !b.completed,
  );
  if (active.length === 1) {
    const [survivorId, survivorBoard] = active[0];
    boards[survivorId] = { ...survivorBoard, score: survivorBoard.score + 10, completed: true };
  }
  return boards;
}

export async function placeCard(roomId: string, playerId: string, rowIndex: number, slotIndex: number, itemIndex?: number): Promise<{ success: boolean; error?: string }> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return { success: false, error: "ゲーム状態が無効です" };
  const data = parseRoomData(doc);
  if (!data?.currentGame?.streams?.currentCard || !data.currentGame.boards) return { success: false, error: "ゲーム状態が無効です" };

  const cg = data.currentGame;
  const board = cg.boards![playerId];
  if (!board) return { success: false, error: "ボードが見つかりません" };
  if (board.eliminated) return { success: false, error: "脱落済みです" };
  if (board.acted) return { success: false, error: "既にアクション済みです" };

  const card = cg.streams!.currentCard!;
  const isKrukkurin = cg.type === "krukkurin";
  const rows = board.rows;
  if (!rows[rowIndex] || rows[rowIndex][slotIndex] === undefined) return { success: false, error: "無効なマス位置です" };
  if (rows[rowIndex][slotIndex] !== 0) return { success: false, error: "そのマスは空いていません" };

  let placeNumber: number;
  let placeColor = "";
  if (isKrukkurin) {
    if (itemIndex === undefined || !card.items?.[itemIndex]) return { success: false, error: "無効なアイテムです" };
    placeNumber = card.items[itemIndex].number;
    placeColor = card.items[itemIndex].color;
  } else {
    placeNumber = card.number;
  }

  const row = rows[rowIndex];
  let leftVal = 0;
  for (let i = slotIndex - 1; i >= 0; i--) { if (row[i] !== 0) { leftVal = row[i]; break; } }
  if (leftVal !== 0 && leftVal > placeNumber) return { success: false, error: "昇順ルール違反です（左の値より小さい）" };
  let rightVal = 0;
  for (let i = slotIndex + 1; i < row.length; i++) { if (row[i] !== 0) { rightVal = row[i]; break; } }
  if (rightVal !== 0 && rightVal < placeNumber) return { success: false, error: "昇順ルール違反です（右の値より大きい）" };

  const newRows = rows.map(r => [...r]);
  newRows[rowIndex][slotIndex] = placeNumber;
  const allFilled = newRows.every(r => r.every(v => v !== 0));
  board.rows = newRows;
  board.completed = allFilled;
  board.acted = true;
  if (isKrukkurin) {
    const newColors = (board.colors || createEmptyColors(cg.type)).map((r: string[]) => [...r]);
    newColors[rowIndex][slotIndex] = placeColor;
    board.colors = newColors;
    board.score = calculateColorScore(newRows, newColors) - board.passCount;
  } else {
    board.score = board.score + card.points;
  }
  if (allFilled) applyLastSurvivorBonus(cg.boards!, playerId);

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, { data: toJson(data) });
  return { success: true };
}

export async function passCard(roomId: string, playerId: string): Promise<{ success: boolean; error?: string }> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return { success: false, error: "ゲーム状態が無効です" };
  const data = parseRoomData(doc);
  if (!data?.currentGame?.boards) return { success: false, error: "ゲーム状態が無効です" };

  const board = data.currentGame.boards[playerId];
  if (!board) return { success: false, error: "ボードが見つかりません" };
  if (board.eliminated) return { success: false, error: "脱落済みです" };
  if (board.acted) return { success: false, error: "既にアクション済みです" };
  board.passCount += 1;
  board.score -= 1;
  board.acted = true;
  board.eliminated = board.passCount >= 4;
  if (board.eliminated) applyLastSurvivorBonus(data.currentGame.boards, playerId);

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, { data: toJson(data) });
  return { success: true };
}

// ===== ゲーム回答送信（GameQuestion.tsx から移動） =====

export async function submitAnswer(
  roomId: string,
  questionId: string,
  playerId: string,
  text: string,
): Promise<void> {
  await getDatabases().createDocument(DATABASE_ID, COLLECTION_ANSWERS, ID.unique(), {
    roomId,
    questionId,
    playerId,
    text,
    submittedAt: Date.now(),
  });
}
