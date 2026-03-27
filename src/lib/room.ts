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

// Room ドキュメント + players + answers → Room オブジェクト組み立て
function assembleRoom(
  doc: Record<string, unknown>,
  players: Record<string, Player>,
  answers: Record<string, Record<string, Answer>>,
): Room {
  const config = parseJson<RoomConfig>(doc.config as string)!;
  if (doc.creatorUid) config.creatorUid = doc.creatorUid as string;

  let currentGame = parseJson<CurrentGame>(doc.currentGame as string);
  if (currentGame && Object.keys(answers).length > 0) {
    currentGame = { ...currentGame, answers };
  }

  return {
    config,
    state: parseJson<RoomState>(doc.state as string)!,
    scenario: parseJson(doc.scenario as string),
    players: Object.keys(players).length > 0 ? players : undefined,
    currentGame,
    messages: parseJson(doc.messages as string),
    gameResults: parseJson(doc.gameResults as string),
    stepResponses: parseJson(doc.stepResponses as string),
    stepReveals: parseJson(doc.stepReveals as string),
    revealVisibility: parseJson(doc.revealVisibility as string),
    publishedTables: parseJson(doc.publishedTables as string),
    publishHistory: parseJson(doc.publishHistory as string),
  };
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

  await getDatabases().createDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    creatorUid: creatorUid || "",
    config: toJson(config),
    state: toJson(state),
    scenario: toJson({ steps: DEFAULT_SCENARIO_STEPS }),
    currentGame: "",
    messages: "",
    gameResults: "",
    stepResponses: "",
    stepReveals: "",
    revealVisibility: "",
    publishedTables: "",
    publishHistory: "",
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
      const config = parseJson<RoomConfig>(d.config as string);
      const state = parseJson<RoomState>(d.state as string);
      if (!config || !state) return null;
      if (d.creatorUid) config.creatorUid = d.creatorUid as string;
      return { id: doc.$id, room: { config, state } as Room };
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
      callback(parseJson<Record<string, AdminMessage>>(doc.messages as string) || null);
    },
  );

  getRoomDoc(roomId).then(doc => {
    callback(doc ? parseJson<Record<string, AdminMessage>>(doc.messages as string) || null : null);
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
      const all = parseJson<Record<string, Record<string, StepResponse>>>(doc.stepResponses as string);
      callback(all?.[key] || null);
    },
  );

  getRoomDoc(roomId).then(doc => {
    if (!doc) { callback(null); return; }
    const all = parseJson<Record<string, Record<string, StepResponse>>>(doc.stepResponses as string);
    callback(all?.[key] || null);
  });

  return unsub;
}

// ===== 台本操作 =====

export async function updateScenario(roomId: string, steps: ScenarioStep[]): Promise<void> {
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    scenario: toJson({ steps }),
  });
}

export async function addScenarioStep(roomId: string, step: ScenarioStep): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) return;
  const steps = room.scenario?.steps || [];
  steps.push(step);
  await updateScenario(roomId, steps);
}

// ===== ステート更新 =====

export async function updateRoomState(roomId: string, state: Partial<RoomState>): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const current = parseJson<RoomState>(doc.state as string)!;
  const merged = { ...current, ...state };
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    state: toJson(merged),
  });
}

// 次のステップへ
export async function goToNextStep(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) return;

  const currentStep = room.state.currentStep;
  const totalSteps = room.scenario?.steps?.length || 0;
  if (currentStep >= totalSteps - 1) return;

  const nextStep = currentStep + 1;
  const newState: RoomState = {
    ...room.state,
    currentStep: nextStep,
    phase: "waiting",
    stepTimestamps: { ...room.state.stepTimestamps, [`s${nextStep}`]: Date.now() },
  };

  const updates: Record<string, string> = {
    state: toJson(newState),
    currentGame: "",
  };

  // ゲーム結果の自動保存
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
        type: cg.type, scope: cg.scope,
        questions: {}, answers: {},
        scores, completedAt: Date.now(),
        streamsHistory: cg.streams?.history || [],
        boards: cg.boards || {},
      };
    } else {
      const { calculateTotalScores } = await import("./scoring");
      let scores: Record<string, number>;
      if (cg.scope === "table") {
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
        type: cg.type, scope: cg.scope,
        questions: cg.questions || {}, answers: cg.answers || {},
        scores, completedAt: Date.now(),
      };
    }

    const currentResults = room.gameResults || {};
    currentResults[String(currentStep)] = gameResult;
    updates.gameResults = toJson(currentResults);
  }

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, updates);
  // 回答コレクションもクリア
  await deleteAllInCollection(COLLECTION_ANSWERS, roomId);
}

// 前のステップへ
export async function goToPrevStep(roomId: string): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const state = parseJson<RoomState>(doc.state as string)!;
  if (state.currentStep <= 0) return;

  const prevStep = state.currentStep - 1;
  state.currentStep = prevStep;
  state.phase = "waiting";
  state.stepTimestamps = { ...state.stepTimestamps, [`s${prevStep}`]: Date.now() };

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    state: toJson(state),
  });
}

export async function setPhase(roomId: string, phase: Phase): Promise<void> {
  await updateRoomState(roomId, { phase });
}

// ===== ゲーム操作 =====

export async function startGame(
  roomId: string,
  gameType: GameType,
  scope: "table" | "whole",
  autoProgress: boolean,
  anonymousMode?: boolean,
): Promise<void> {
  const game: CurrentGame = {
    type: gameType, scope, autoProgress,
    anonymousMode: anonymousMode || undefined,
  };
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(game),
  });
  await setPhase(roomId, "playing");
}

export async function advanceTableProgress(roomId: string, tableKey: string, nextIndex: number): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (!cg) return;
  if (!cg.tableProgress) cg.tableProgress = {};
  cg.tableProgress[tableKey] = nextIndex;
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(cg),
  });
}

export async function advanceGameProgress(roomId: string, nextIndex: number): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (!cg) return;
  cg.currentQuestionIdx = nextIndex;
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(cg),
  });
}

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
      text: pq.text, timeLimit: 0, status: "open",
      inputType: pq.inputType, sentAt: now + i,
    };
    if (pq.inputType === "select" && pq.options) {
      q.options = pq.options.filter(o => o.trim());
    }
    questions[qId] = q;
    questionOrder.push(qId);
  });

  const game: CurrentGame = {
    type: gameType, scope: "table", autoProgress: true,
    anonymousMode: anonymousMode || undefined,
    questions, questionOrder, tableProgress: {},
    activeQuestionId: questionOrder[0],
    sentQuestionIndices: presetQuestions.map((_, i) => i),
  };

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(game),
  });
  await setPhase(roomId, "playing");
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
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (!cg?.questionOrder) return;

  const tableKey = `table_${tableNumber}`;
  const currentIdx = cg.tableProgress?.[tableKey] ?? 0;
  if (currentIdx < cg.questionOrder.length) {
    if (!cg.tableProgress) cg.tableProgress = {};
    cg.tableProgress[tableKey] = currentIdx + 1;
    await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
      currentGame: toJson(cg),
    });
  }
}

export async function forceAdvanceAllTables(roomId: string, targetIndex: number): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (!cg?.questionOrder) return;

  const config = parseJson<RoomConfig>(doc.config as string)!;
  let changed = false;
  if (!cg.tableProgress) cg.tableProgress = {};
  for (let t = 1; t <= config.tableCount; t++) {
    const tableKey = `table_${t}`;
    const currentIdx = cg.tableProgress[tableKey] ?? 0;
    if (currentIdx < targetIndex) {
      cg.tableProgress[tableKey] = targetIndex;
      changed = true;
    }
  }
  if (changed) {
    await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
      currentGame: toJson(cg),
    });
  }
}

// ===== お題操作 =====

export async function sendQuestion(
  roomId: string,
  text: string,
  inputType: "text" | "number" | "select" = "text",
  options?: string[],
  presetIndex?: number,
): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string) || {} as CurrentGame;
  const questionId = `q_${Date.now()}`;

  const question: Question = inputType === "select" && options
    ? { text, timeLimit: 0, status: "open", inputType, options, sentAt: Date.now() }
    : { text, timeLimit: 0, status: "open", inputType, sentAt: Date.now() };

  if (!cg.questions) cg.questions = {};
  cg.questions[questionId] = question;
  cg.activeQuestionId = questionId;

  if (presetIndex !== undefined) {
    const currentSent = cg.sentQuestionIndices || [];
    if (!currentSent.includes(presetIndex)) {
      cg.sentQuestionIndices = [...currentSent, presetIndex];
    }
  }

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(cg),
  });
}

export async function reopenQuestion(roomId: string, questionId: string): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (!cg?.questions?.[questionId]) return;
  cg.questions[questionId].status = "open";
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(cg),
  });
}

export async function hideAnswers(roomId: string, questionId: string): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (!cg?.questions?.[questionId]) return;
  cg.questions[questionId].status = "closed";
  delete cg.questions[questionId].revealScope;
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(cg),
  });
}

export async function closeQuestion(roomId: string, questionId?: string): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (!cg) return;
  const targetId = questionId || cg.activeQuestionId;
  if (!targetId || !cg.questions?.[targetId]) return;
  cg.questions[targetId].status = "closed";
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(cg),
  });
}

export async function revealAnswers(
  roomId: string,
  questionId?: string,
  revealScope?: AnswerRevealScope,
): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (!cg) return;
  const targetId = questionId || cg.activeQuestionId;
  if (!targetId || !cg.questions?.[targetId]) return;
  cg.questions[targetId].status = "revealed";
  if (revealScope) cg.questions[targetId].revealScope = revealScope;
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(cg),
  });
}

export async function resetCurrentGame(roomId: string): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (cg) {
    delete cg.questions;
    delete cg.answers;
    delete cg.activeQuestionId;
    delete cg.sentQuestionIndices;
    await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
      currentGame: toJson(cg),
    });
  }
  await deleteAllInCollection(COLLECTION_ANSWERS, roomId);
}

export async function toggleScoreboard(roomId: string, show: boolean): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (!cg) return;
  cg.showScoreboard = show || undefined;
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(cg),
  });
}

export async function saveGameResult(roomId: string, stepIndex: number, gameResult: GameResult): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const results = parseJson<Record<string, GameResult>>(doc.gameResults as string) || {};
  results[String(stepIndex)] = gameResult;
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    gameResults: toJson(results),
  });
}

// ===== 設定更新 =====

async function updateConfig(roomId: string, updater: (config: RoomConfig) => void): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const config = parseJson<RoomConfig>(doc.config as string)!;
  updater(config);
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    config: toJson(config),
  });
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

export async function sendAdminMessage(
  roomId: string,
  text: string,
  target: MessageTarget,
  currentStep: number,
): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const messages = parseJson<Record<string, AdminMessage>>(doc.messages as string) || {};
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  messages[msgId] = { id: msgId, text, target, sentAt: Date.now(), sentDuringStep: currentStep };
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    messages: toJson(messages),
  });
}

// ===== ステップ回答 =====

export async function submitStepResponse(
  roomId: string,
  stepIndex: number,
  playerId: string,
  value: string | number,
  playerName: string,
  tableNumber: number,
): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const all = parseJson<Record<string, Record<string, StepResponse>>>(doc.stepResponses as string) || {};
  const key = String(stepIndex);
  if (!all[key]) all[key] = {};
  all[key][playerId] = { value, submittedAt: Date.now(), playerName, tableNumber };
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    stepResponses: toJson(all),
  });
}

export async function setStepReveal(roomId: string, stepIndex: number, reveal: StepInputReveal): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const all = parseJson<Record<string, StepInputReveal>>(doc.stepReveals as string) || {};
  all[String(stepIndex)] = reveal;
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    stepReveals: toJson(all),
  });
}

export async function clearStepReveal(roomId: string, stepIndex: number): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const all = parseJson<Record<string, StepInputReveal>>(doc.stepReveals as string) || {};
  delete all[String(stepIndex)];
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    stepReveals: toJson(all),
  });
}

export async function resetStepResponses(roomId: string, stepIndex: number): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const all = parseJson<Record<string, Record<string, StepResponse>>>(doc.stepResponses as string) || {};
  delete all[String(stepIndex)];
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    stepResponses: toJson(all),
  });
}

export async function resetStepAll(roomId: string, stepIndex: number): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const responses = parseJson<Record<string, Record<string, StepResponse>>>(doc.stepResponses as string) || {};
  const reveals = parseJson<Record<string, StepInputReveal>>(doc.stepReveals as string) || {};
  delete responses[String(stepIndex)];
  delete reveals[String(stepIndex)];
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    stepResponses: toJson(responses),
    stepReveals: toJson(reveals),
  });
}

export async function setRevealQuestionVisibility(
  roomId: string,
  stepIndex: number,
  questionId: string,
  visible: boolean,
): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const all = parseJson<Record<string, Record<string, boolean>>>(doc.revealVisibility as string) || {};
  if (!all[String(stepIndex)]) all[String(stepIndex)] = {};
  all[String(stepIndex)][questionId] = visible;
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    revealVisibility: toJson(all),
  });
}

// ===== ステップ割り込み =====

export async function insertStepAfterCurrent(
  roomId: string,
  newStep: ScenarioStep,
  autoAdvance: boolean,
): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const state = parseJson<RoomState>(doc.state as string)!;
  const scenario = parseJson<{ steps: ScenarioStep[] }>(doc.scenario as string);
  if (!scenario) return;

  const currentStep = state.currentStep;
  scenario.steps.splice(currentStep + 1, 0, newStep);

  const updates: Record<string, string> = {
    scenario: toJson(scenario),
  };

  if (autoAdvance) {
    state.currentStep = currentStep + 1;
    state.phase = "waiting";
    state.stepTimestamps = { ...state.stepTimestamps, [`s${currentStep + 1}`]: Date.now() };
    updates.state = toJson(state);
  }

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, updates);
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
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const players = await fetchPlayers(roomId);
  if (Object.keys(players).length === 0) return;

  const assignments: Record<string, number> = {};
  Object.entries(players).forEach(([id, player]) => {
    assignments[id] = player.tableNumber;
  });

  const now = Date.now();
  const historyId = `pub_${now}`;
  const history = parseJson<Record<string, { pushedAt: number; assignments: Record<string, number> }>>(doc.publishHistory as string) || {};
  history[historyId] = { pushedAt: now, assignments };

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    publishedTables: toJson({ assignments, pushedAt: now }),
    publishHistory: toJson(history),
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
  const config = parseJson<RoomConfig>(doc.config as string)!;
  const players = await fetchPlayers(roomId);

  const tableCount = config.tableCount || 1;
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
  const config = parseJson<RoomConfig>(doc.config as string)!;
  const players = await fetchPlayers(roomId);

  const tableCount = config.tableCount || 1;
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

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(game),
    state: toJson({ ...(parseJson<RoomState>((await getRoomDoc(roomId))?.state as string) || { currentStep: 0, phase: "waiting" }), phase: "playing" }),
  });
}

export async function flipCard(roomId: string): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
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
    const card = {
      number: num1, points: 0,
      items: [{ number: num1, color: color1 }, { number: num2, color: color2 }],
      flippedAt: Date.now(),
    };
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

  // 全員の acted をリセット
  if (cg.boards) {
    Object.entries(cg.boards).forEach(([, board]) => {
      if (!board.eliminated && !board.completed) {
        board.acted = false;
      }
    });
  }

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(cg),
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

export async function placeCard(
  roomId: string,
  playerId: string,
  rowIndex: number,
  slotIndex: number,
  itemIndex?: number,
): Promise<{ success: boolean; error?: string }> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return { success: false, error: "ゲーム状態が無効です" };
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (!cg?.streams?.currentCard || !cg.boards) return { success: false, error: "ゲーム状態が無効です" };

  const board = cg.boards[playerId];
  if (!board) return { success: false, error: "ボードが見つかりません" };
  if (board.eliminated) return { success: false, error: "脱落済みです" };
  if (board.acted) return { success: false, error: "既にアクション済みです" };

  const card = cg.streams.currentCard;
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

  // 昇順バリデーション
  const row = rows[rowIndex];
  let leftVal = 0;
  for (let i = slotIndex - 1; i >= 0; i--) { if (row[i] !== 0) { leftVal = row[i]; break; } }
  if (leftVal !== 0 && leftVal > placeNumber) return { success: false, error: "昇順ルール違反です（左の値より小さい）" };
  let rightVal = 0;
  for (let i = slotIndex + 1; i < row.length; i++) { if (row[i] !== 0) { rightVal = row[i]; break; } }
  if (rightVal !== 0 && rightVal < placeNumber) return { success: false, error: "昇順ルール違反です（右の値より大きい）" };

  // 配置実行
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

  if (allFilled) {
    applyLastSurvivorBonus(cg.boards, playerId);
  }

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(cg),
  });
  return { success: true };
}

export async function passCard(
  roomId: string,
  playerId: string,
): Promise<{ success: boolean; error?: string }> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return { success: false, error: "ゲーム状態が無効です" };
  const cg = parseJson<CurrentGame>(doc.currentGame as string);
  if (!cg?.boards) return { success: false, error: "ゲーム状態が無効です" };

  const board = cg.boards[playerId];
  if (!board) return { success: false, error: "ボードが見つかりません" };
  if (board.eliminated) return { success: false, error: "脱落済みです" };
  if (board.acted) return { success: false, error: "既にアクション済みです" };

  board.passCount += 1;
  board.score -= 1;
  board.acted = true;
  board.eliminated = board.passCount >= 4;

  if (board.eliminated) {
    applyLastSurvivorBonus(cg.boards, playerId);
  }

  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    currentGame: toJson(cg),
  });
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
