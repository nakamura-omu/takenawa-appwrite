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

// ステップごとの参加者表示設定
export interface StepDisplayConfig {
  message?: string;          // 参加者に表示するメッセージ（例: "テーブルに着席してください"）
  showTablemates?: boolean;  // 同テーブルのメンバー名を表示するか
  showFields?: string[];     // 表示する参加者フィールドID（例: ["school", "age"]）
}

// ステップ入力設定
export interface StepInputConfig {
  prompt: string;           // "好きな食べ物は？"
  inputType: "text" | "number" | "select";
  options?: string[];       // selectの場合
}

// 台本のステップ
export interface ScenarioStep {
  type: StepType;
  label: string;
  gameType?: GameType;
  config?: {
    timeLimit?: number;  // 秒
  };
  display?: StepDisplayConfig;  // 参加者表示設定
  input?: StepInputConfig;      // 参加者入力プロンプト
}

// タイムラインスナップショット（localStorage保存用）
export interface TimelineSnapshot {
  tableNumber: number;
  tablemates: string[];       // スナップショット時点のテーブルメイト名
  fieldValues?: Record<string, string | number>;
  capturedAt: number;
}

// エントリーフィールド定義
export interface EntryField {
  id: string;        // "name", "school", "age" など
  label: string;     // 表示名: "名前", "学校名" など
  type: "text" | "number" | "select";
  required: boolean;
  options?: string[]; // type="select" の場合の選択肢
}

// ルーム設定
export interface RoomConfig {
  eventName: string;
  eventDate: string; // YYYY-MM-DD
  tableCount: number;
  createdAt: number;
  adminPassword: string;
  adminName?: string;   // 管理者名（メッセージ送信者名として表示）
  creatorUid?: string;  // Anonymous Auth UID（マイルーム復元用）
  entryFields: EntryField[];  // 参加者入力フィールド定義
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
  fields: Record<string, string | number>;  // カスタムフィールド値
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

// 管理者メッセージ
export type MessageTarget =
  | { type: "all" }
  | { type: "table"; tableNumber: number }
  | { type: "player"; playerId: string };

export interface AdminMessage {
  id: string;
  text: string;
  target: MessageTarget;
  sentAt: number;
  sentDuringStep: number;  // 送信時のcurrentStep（タイムライン並び順用）
}

// ステップ回答
export interface StepResponse {
  value: string | number;
  submittedAt: number;
  playerName: string;       // 非正規化（表示用）
  tableNumber: number;      // 非正規化（テーブル絞り込み用）
}

// 開示モード
export type RevealMode = "named" | "anonymous" | "admin_only";
export interface StepInputReveal {
  mode: RevealMode;
  target: "all" | "same_table";
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
  messages?: Record<string, AdminMessage>;
  stepResponses?: Record<string, Record<string, StepResponse>>;  // stepIndex -> playerId -> response
  stepReveals?: Record<string, StepInputReveal>;                  // stepIndex -> reveal config
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
