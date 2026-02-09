// ルームのデータ構造定義

export type StepType =
  | "entry"
  | "table_game"
  | "whole_game"
  | "break"
  | "result"
  | "end";

export type GameType =
  | "value_match"  // 価値観マッチ
  | "seno"         // せーの！
  | "streams";     // ストリームス

export type Phase =
  | "waiting"
  | "playing"
  | "result"
  | "break";

export type QuestionStatus =
  | "open"
  | "closed"
  | "revealed";

// 台本のステップ
export interface ScenarioStep {
  type: StepType;
  label: string;
  gameType?: GameType;
  config?: {
    timeLimit?: number;  // 秒
  };
}

// ルーム設定
export interface RoomConfig {
  tableCount: number;
  createdAt: number;
}

// ルーム状態
export interface RoomState {
  currentStep: number;
  phase: Phase;
}

// 参加者
export interface Player {
  name: string;
  tableNumber: number;
  connected: boolean;
  joinedAt: number;
}

// お題
export interface Question {
  text: string;
  timeLimit: number;
  status: QuestionStatus;
}

// 回答
export interface Answer {
  text: string;
  submittedAt: number;
}

// テーブルスコア
export interface TableScore {
  total: number;
  rounds?: Record<string, number>;
}

// プレイヤースコア
export interface PlayerScore {
  total: number;
  gameScores?: Record<string, number>;
}

// 現在のゲーム状態
export interface CurrentGame {
  type: GameType;
  round?: number;
  question?: Question;
  answers?: Record<string, Answer>;
  // ストリームス用
  streams?: {
    deck: number[];
    drawnCards: number[];
    currentCard: number | null;
    cardIndex: number;
    placements?: Record<string, (number | null)[]>;
  };
}

// ルーム全体
export interface Room {
  config: RoomConfig;
  state: RoomState;
  scenario?: {
    steps: ScenarioStep[];
  };
  players?: Record<string, Player>;
  currentGame?: CurrentGame;
  scores?: {
    tables?: Record<string, TableScore>;
    players?: Record<string, PlayerScore>;
  };
}

// デフォルトの台本
export const DEFAULT_SCENARIO_STEPS: ScenarioStep[] = [
  { type: "entry", label: "受付" },
  { type: "table_game", label: "テーブルゲーム ラウンド1", gameType: "value_match", config: { timeLimit: 30 } },
  { type: "table_game", label: "テーブルゲーム ラウンド2", gameType: "seno", config: { timeLimit: 30 } },
  { type: "table_game", label: "テーブルゲーム ラウンド3", gameType: "value_match", config: { timeLimit: 30 } },
  { type: "break", label: "歓談タイム" },
  { type: "whole_game", label: "全体ゲーム", gameType: "streams", config: { timeLimit: 15 } },
  { type: "result", label: "結果発表" },
  { type: "end", label: "閉会" },
];
