import { ref, set, get, update, onValue, off, push } from "firebase/database";
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
} from "@/types/room";

// ルームIDの生成（6文字の英数字）
export function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字を除外
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ルーム作成
export async function createRoom(tableCount: number, customRoomId?: string): Promise<string> {
  const roomId = customRoomId || generateRoomId();
  const roomRef = ref(getDb(), `rooms/${roomId}`);

  const initialRoom: Room = {
    config: {
      tableCount,
      createdAt: Date.now(),
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

// 台本の更新
export async function updateScenario(roomId: string, steps: ScenarioStep[]): Promise<void> {
  const scenarioRef = ref(getDb(), `rooms/${roomId}/scenario/steps`);
  await set(scenarioRef, steps);
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

// お題の送出
export async function sendQuestion(
  roomId: string,
  text: string,
  timeLimit: number = 30
): Promise<void> {
  const questionRef = ref(getDb(), `rooms/${roomId}/currentGame/question`);
  const question: Question = {
    text,
    timeLimit,
    status: "open",
  };
  await set(questionRef, question);
}

// 回答の締切
export async function closeQuestion(roomId: string): Promise<void> {
  const statusRef = ref(getDb(), `rooms/${roomId}/currentGame/question/status`);
  await set(statusRef, "closed");
}

// 結果の公開
export async function revealAnswers(roomId: string): Promise<void> {
  const statusRef = ref(getDb(), `rooms/${roomId}/currentGame/question/status`);
  await set(statusRef, "revealed");
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
