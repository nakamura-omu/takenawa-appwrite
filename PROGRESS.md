# 宴会進行補助サービス 開発進捗

## 完了したこと

### 1. プロジェクト基盤
- [x] Next.js 15 + TypeScript + Tailwind CSS セットアップ
- [x] Firebase Realtime Database 接続設定
- [x] 型定義 (`src/types/room.ts`)
- [x] Firebase操作ユーティリティ (`src/lib/room.ts`)
- [x] Vercel デプロイ設定

### 2. 管理者画面 (`/admin`)
- [x] ルーム作成（テーブル数設定、カスタムID可）
- [x] QRコード表示（参加者用URL）
- [x] 台本ステップ一覧表示（展開/折りたたみ、ステップタイプ別色分け）
- [x] 進行コントロール（前へ/次へボタン、スティッキー固定）
- [x] ゲーム操作パネル（お題送出、回答締切、結果公開）
- [x] 参加者モニター（テーブル別表示、プレゼンス表示）
- [x] ルーム削除機能
- [x] カスタムエントリーフィールド設定UI（追加・削除・並べ替え・タイプ選択）
- [x] テーブル割り当てUI（未割当エリア + テーブル別、クリックで割り当て・移動）
- [x] 台本編集モード（ステップの追加・削除・並べ替え・タイプ変更）
- [x] 個別ステップ編集（進行中でも即時保存）
- [x] ステップ割り込み（進行中に新ステップを即座に挿入）
- [x] 管理者メッセージ送信（全員/テーブル/個人ターゲット）
- [x] ステップ入力設定・回答閲覧・開示パネル
- [x] 表示モード切替（全パネル/進行集中）
- [x] 参加者プレビューパネル
- [x] ステップタイマー（経過時間・残り時間表示）
- [x] テーブルシャッフル（完全シャッフル / 半数シャッフル）
- [x] テーブル未割当者への参加者一覧表示設定

### 3. 参加者画面
- [x] エントリーフォーム（カスタムフィールド対応、動的生成）
- [x] スクロール型タイムラインUI（ステップカード + メッセージカード統合）
- [x] ステップ進行連動（リアルタイム）
- [x] テーブルメイト表示（項目名：入力内容 形式）
- [x] localStorageによるスナップショット保存・復元
- [x] 新しいカード追加時の自動スクロール
- [x] ステップ入力フォーム・開示回答表示
- [x] 参加者一覧ステップ（全テーブル表示、自テーブルハイライト）
- [x] 過去ステップの参加者一覧フリーズ（publishHistory利用）
- [x] アンケート入力・結果表示（単一選択・複数選択対応）

### 4. ゲームシステム

#### テーブルゲーム / 全体ゲーム共通
- [x] お題送出・回答受付・締切・結果公開フロー
- [x] プリセットお題集（questionBank: 各ゲーム100問以上）
- [x] ゲームルール表示

#### チューニングガム (tuning_gum)
- [x] 自由回答一致判定・自動スコアリング
- [x] テーブルゲーム・全体ゲーム両対応

#### いい線行きましょう (good_line)
- [x] 数値回答の中央値計算・スコアリング
- [x] ナンセンス系含むお題100問以上

#### みんなのイーブン (evens)
- [x] Yes/No/Even 3択回答
- [x] バランス判定（Yes:No比率2倍未満→Even勝ち1pt、偏り→多数派1pt）

#### くるっくりん (krukkurin)
- [x] 3行×8列ボード
- [x] カードめくり（2アイテム: 色付き数字）→ 1つ選んで配置
- [x] 4色（赤・青・白・緑）ランダム割当
- [x] 昇順制約（各行左→右）
- [x] 色グループスコア計算（横連続 + 縦同色ボーナス）
- [x] パス（-1pt）/ 脱落（4回パス）/ 生存者ボーナス
- [x] 管理者側: カードめくり・状況モニター・スコア表示

#### メタストリームス (meta_streams)
- [x] 1列18マスボード
- [x] カード配置・昇順制約
- [x] 連続マススコア計算
- [x] パス/脱落/生存者ボーナス

### 5. 認証・プレゼンス
- [x] Firebase Anonymous Authentication
- [x] マイルーム機能（creatorUid基づく一覧表示）
- [x] 管理者自動認証（creatorUid一致）
- [x] プレゼンスリアルタイム追跡（`.info/connected` + `onDisconnect()`）
- [x] 接続状態ドット表示 + カウンター

## ファイル構成

```
src/
├── app/
│   ├── layout.tsx              # 共通レイアウト
│   ├── page.tsx                # トップ + 参加者エントリー + タイムライン
│   ├── globals.css             # グローバルスタイル
│   └── admin/
│       ├── page.tsx            # /admin リダイレクト
│       └── [roomId]/
│           └── page.tsx        # 管理者画面（全パネル/進行集中モード）
├── lib/
│   ├── firebase.ts             # Firebase初期化 + Anonymous Auth + プレゼンス
│   ├── room.ts                 # ルーム操作関数
│   ├── scoring.ts              # ゲームスコア計算（各ゲームタイプ）
│   ├── deckGenerator.ts        # カードデッキ生成・ボードレイアウト
│   ├── timeline.ts             # タイムラインスナップショット管理
│   ├── gameRules.ts            # ゲームルール文面定義
│   └── questionBank.ts         # プリセットお題集
├── types/
│   └── room.ts                 # 型定義
└── components/
    ├── admin/
    │   ├── ScenarioPanel.tsx    # 台本・進行（割り込み含む）
    │   ├── ScenarioEditMode.tsx # 台本編集モード
    │   ├── StepDetailView.tsx   # ステップ詳細表示
    │   ├── StepEditForm.tsx     # ステップ編集フォーム
    │   ├── StepTimer.tsx        # ステップタイマー
    │   ├── InterruptForm.tsx    # 割り込みステップ挿入
    │   ├── GameControls.tsx     # ゲーム操作パネル
    │   ├── GameQuestionEditor.tsx # お題編集
    │   ├── MessageSender.tsx    # メッセージ送信
    │   ├── RoomInfoPanel.tsx    # ルーム情報・QR
    │   ├── PlayersPanel.tsx     # 参加者モニター・テーブル割り当て
    │   ├── PlayerPreviewPanel.tsx # 参加者プレビュー
    │   └── scenarioUtils.ts    # シナリオユーティリティ
    └── player/
        ├── EntryForm.tsx        # エントリーフォーム
        ├── PlayerTimeline.tsx   # タイムライン表示
        ├── TimelineCard.tsx     # タイムラインカード
        ├── MessageCard.tsx      # メッセージカード
        ├── ParticipantsRoster.tsx # 参加者一覧（全テーブル表示）
        ├── GameQuestion.tsx     # ゲームお題回答
        ├── RevealDisplay.tsx    # 結果表示
        ├── ScoreBoard.tsx       # スコアボード
        ├── StreamsBoard.tsx     # くるっくりん/メタストリームスボード
        ├── SurveyInput.tsx      # アンケート入力
        └── PastGameLog.tsx      # 過去ゲーム履歴
```

## 環境設定

### 必要なファイル
- `.env.local` - Firebase設定（`.env.local.example`を参考に作成）

### Firebase設定
1. Firebase Console でプロジェクト作成済み
2. Realtime Database 有効化済み
3. Anonymous Authentication 有効化済み
4. セキュリティルール:

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": "auth != null",
      ".indexOn": ["config/creatorUid"]
    }
  }
}
```

## 起動・デプロイ

```bash
# ローカル開発
npm install
npm run dev
# キャッシュ破損時
npm run restart

# デプロイ
npx vercel --prod
```

管理者画面: http://localhost:3000/admin
