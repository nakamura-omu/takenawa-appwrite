// ルームのデータ構造定義

export type StepType =
  | "entry"
  | "table_game"
  | "whole_game"
  | "break"
  | "end"
  | "survey"         // アンケート集計（選択肢→結果表示）
  | "survey_open"    // アンケート回答依頼（フリーテキスト収集）
  | "survey_result"  // アンケート結果表示
  | "participants"   // 参加者一覧（テーブル移動案内用）
  | "reveal";        // 汎用回答開示

export type GameType =
  | "tuning_gum"       // チューニングガム
  | "good_line"        // いい線行きましょう
  | "evens"            // みんなのイーブン
  | "krukkurin"        // くるっくりん
  | "meta_streams";    // メタストリームス

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

// ゲームのお題設定
export interface GameQuestion {
  text: string;                           // お題テキスト
  inputType: "text" | "number" | "select";
  options?: string[];                     // selectの場合の選択肢
}

// アンケート設定
export interface SurveyConfig {
  question: string;         // アンケートの質問
  options: string[];        // 選択肢
  allowMultiple?: boolean;  // 複数選択可能か
  resultStepIndex?: number; // 結果表示ステップのインデックス（自動設定）
  questionStepIndex?: number; // 質問ステップのインデックス（結果ステップ用）
}

// 汎用回答開示設定
export type RevealDisplayType = "list" | "bar_chart" | "pie_chart" | "scoreboard";

export interface RevealConfig {
  sourceStepIndex: number;
  displayType: RevealDisplayType;
  scope?: AnswerRevealScope;
}

// 台本のステップ
export interface ScenarioStep {
  type: StepType;
  label: string;
  durationMinutes?: number;  // ステップ所要時間（分）— タイムキープ用
  gameType?: GameType;
  config?: {
    timeLimit?: number;       // 秒（レガシー、未使用）
    questions?: GameQuestion[]; // 事前設定のお題リスト（ゲーム系ステップ用）
  };
  display?: StepDisplayConfig;  // 参加者表示設定
  survey?: SurveyConfig;        // アンケート設定
  reveal?: RevealConfig;        // 汎用回答開示設定
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
  showInHeader?: boolean; // テーブル情報ヘッダーに表示するか
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
  showRosterToUnassigned?: boolean;  // テーブル未割当者にも参加者一覧を表示するか
}

// ルーム状態
export interface RoomState {
  currentStep: number;
  phase: Phase;
  stepTimestamps?: Record<string, number>;  // stepIndex -> そのステップ開始時刻
}

// 参加者
export interface Player {
  name: string;
  tableNumber: number;
  connected: boolean;
  joinedAt: number;
  fields: Record<string, string | number>;  // カスタムフィールド値
}

// 回答公開スコープ
export type AnswerRevealScope =
  | { type: "all" }
  | { type: "table" }
  | { type: "players"; playerIds: string[] };

// お題
export interface Question {
  text: string;
  timeLimit: number;
  status: QuestionStatus;
  inputType: "text" | "number" | "select";
  options?: string[];  // selectの場合の選択肢
  sentAt?: number;     // 送出時刻（ログ順序用）
  revealScope?: AnswerRevealScope;  // 回答公開範囲
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

// カードめくりゲーム用ステート
export interface StreamsCardItem {
  number: number;
  color: string;     // "red" | "blue" | "white" | "green"
}

export interface StreamsCard {
  number: number;     // めくった数字（meta_streams用 / krukkurin: items[0].number）
  points: number;     // ランダム得点（meta_streams用 / krukkurin: 0）
  items?: StreamsCardItem[];  // くるっくりん用: 2アイテム（number + color）
  flippedAt: number;  // めくった時刻
}

export interface PlayerBoard {
  rows: number[][];  // 行ごとのマス（0=空、1以上=配置済みカード番号）
  colors?: string[][];        // くるっくりん用: セルの色（"" = 空）
  passCount: number;
  eliminated: boolean;
  completed: boolean;
  score: number;              // 累積得点
  acted: boolean;             // 現カードにアクション済みか
}

// 現在のゲーム状態
export interface CurrentGame {
  type: GameType;
  scope: "table" | "whole";         // テーブル内 or 全体
  autoProgress: boolean;             // 全員回答で自動進行
  anonymousMode?: boolean;           // 匿名回答（シャッフル表示）
  round?: number;
  // 複数お題対応（ログ形式で蓄積）
  questions?: Record<string, Question>;  // questionId -> Question
  answers?: Record<string, Record<string, Answer>>;  // questionId -> playerId -> Answer
  activeQuestionId?: string;  // 現在アクティブな（受付中の）お題ID
  questionOrder?: string[];        // 自動進行用の問題順序
  sentQuestionIndices?: number[]; // 送出済みの事前設定お題インデックス
  // テーブルモード時のテーブル別進行状態
  tableProgress?: Record<string, number>; // "table_N" -> questionOrderのindex
  // 全体モード時の進行状態
  currentQuestionIdx?: number;
  showScoreboard?: boolean;           // 管理者がスコアボードを参加者に表示するか
  // Streams系ゲーム用
  streams?: {
    deck: number[];                  // シャッフル済みデッキ
    currentCardIdx: number;          // 現在のインデックス
    currentCard: StreamsCard | null; // 現在めくられたカード
    history: StreamsCard[];          // めくり履歴
  };
  boards?: Record<string, PlayerBoard>; // playerId -> ボード状態
}

// ゲーム結果（永続化用）
export interface GameResult {
  type: GameType;
  scope: "table" | "whole";
  questions: Record<string, Question>;
  answers: Record<string, Record<string, Answer>>;
  scores: Record<string, number>;  // playerId -> total
  completedAt: number;
  // Streams系ゲームの結果
  streamsHistory?: StreamsCard[];
  boards?: Record<string, PlayerBoard>;
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
  gameResults?: Record<string, GameResult>;  // stepIndex -> ゲーム結果
  stepResponses?: Record<string, Record<string, StepResponse>>;  // stepIndex -> playerId -> response
  stepReveals?: Record<string, StepInputReveal>;                  // stepIndex -> reveal config
  publishedTables?: {
    assignments: Record<string, number>;  // playerId -> tableNumber
    pushedAt: number;
  };
  publishHistory?: Record<string, {
    pushedAt: number;
    assignments: Record<string, number>;
  }>;
}

// デフォルトの台本
export const DEFAULT_SCENARIO_STEPS: ScenarioStep[] = [
  { type: "entry", label: "受付", durationMinutes: 10 },
  { type: "table_game", label: "チューニングガム", gameType: "tuning_gum", durationMinutes: 15 },
  { type: "table_game", label: "いい線行きましょう", gameType: "good_line", durationMinutes: 15 },
  { type: "break", label: "歓談タイム", durationMinutes: 10 },
  { type: "whole_game", label: "みんなのイーブン", gameType: "evens", durationMinutes: 15 },
  { type: "end", label: "閉会" },
];
