# 宴会ゲームアプリ 開発進捗

## 完了したこと

### 1. プロジェクト基盤
- [x] Next.js 15 + TypeScript + Tailwind CSS セットアップ
- [x] Firebase Realtime Database 接続設定
- [x] 型定義 (`src/types/room.ts`)
- [x] Firebase操作ユーティリティ (`src/lib/room.ts`)

### 2. 管理者画面 (`/admin`)
- [x] ルーム作成（テーブル数設定、カスタムID可）
- [x] QRコード表示（参加者用URL）
- [x] 台本ステップ一覧表示
- [x] 進行コントロール（前へ/次へボタン）
- [x] ゲーム操作パネル（お題送出、回答締切、結果公開）
- [x] 参加者モニター（テーブル別表示）
- [x] ルーム削除機能
- [x] カスタムエントリーフィールド設定UI（追加・削除・並べ替え・タイプ選択）
- [x] テーブル割り当てUI（未割当エリア + テーブル別、クリックで割り当て・移動）

### 3. 参加者エントリー画面 (`/?room=XXX`)
- [x] ルーム情報取得・表示
- [x] カスタムエントリーフィールドに基づく動的フォーム生成
- [x] 参加者データのFirebase書き込み（テーブル番号=0: 未割当）
- [x] エントリー後のリアルタイム表示（テーブル番号・入力情報）

### 4. 参加者タイムライン表示
- [x] スクロール型タイムラインUI（ステップごとにカードが蓄積）
- [x] ルーム購読によるステップ進行連動
- [x] プレイヤー一覧購読によるテーブルメイト情報取得
- [x] ステップごとの表示設定（StepDisplayConfig: message, showTablemates, showFields）
- [x] メッセージ中プレースホルダー置換（{tableNumber}, {name}）
- [x] localStorageによるスナップショット保存・復元（テーブル移動後も前の情報が残る）
- [x] ステップタイプ別デフォルト表示（entry/break/end等）
- [x] 新しいカード追加時の自動スクロール

### 5. 管理者画面: ステップ表示設定
- [x] 台本エディタに参加者表示設定フォーム追加（メッセージ・テーブルメイト・フィールド選択）
- [x] ステップ詳細パネルに表示設定の読み取り表示

### 6. メッセージ送受信 & ステップ割り込み
- [x] 型定義追加（AdminMessage, MessageTarget, StepInputConfig, StepResponse, StepInputReveal 等）
- [x] Firebase関数追加（sendAdminMessage, subscribeToMessages, submitStepResponse, subscribeToStepResponses, setStepReveal, clearStepReveal, insertStepAfterCurrent）
- [x] ステップ割り込み: 進行コントロール横に「割り込み」ボタン + インラインフォーム
- [x] 管理者メッセージ送信: MessageSender コンポーネント（ターゲット: 全員/テーブル/個人、送信履歴）
- [x] ステップ入力設定: 個別編集/台本編集にプロンプト設定UI追加
- [x] 回答閲覧・開示パネル（StepResponsesPanel）: 回答一覧 + 6種開示ボタン
- [x] 参加者タイムラインにメッセージカード（黄色）統合表示（ターゲットフィルタ付き）
- [x] 参加者入力フォーム（StepInputForm）: 送信済み復元対応
- [x] 開示された回答の表示（RevealedResponses）: named/anonymous/same_table 対応
- [x] 進行コントロールのスティッキー固定 + 現在ステップ表示
- [x] 管理画面レイアウト切替（全パネル / 進行集中モード）

### 7. 認証・プレゼンス・ルーム情報改善
- [x] Firebase Anonymous Authentication 導入（書き込みに `auth != null` を要求）
- [x] マイルーム機能: creatorUid に基づくルーム一覧表示（トップページ上部）
- [x] 管理者画面の自動認証: creatorUid 一致でパスワード不要
- [x] 主催者名設定: メッセージカードの送信者名を設定可能（未設定時「主催より」）
- [x] ルーム情報パネル再構成: QR+ID / イベント設定（全項目インライン編集）/ エントリー項目
- [x] イベント名・日時の編集機能追加
- [x] プレゼンス（接続状態）リアルタイム追跡: `.info/connected` + `onDisconnect()` 活用
- [x] 参加者リストに接続状態ドット表示（緑=接続中 / 灰=切断）
- [x] 接続中カウンター表示（N/M人 接続中）

## 未実装（次のステップ）

### 管理者画面の追加機能
- [ ] プリセットお題集の選択UI
- [ ] スコア集計・表示

### 参加者画面 (`/play`)
- [ ] ゲーム画面（お題表示、回答入力）
- [ ] 結果表示画面
- [ ] 歓談タイム画面
- [ ] ストリームス（全体ゲーム）UI

## ファイル構成

```
src/
├── app/
│   ├── layout.tsx          # 共通レイアウト
│   ├── page.tsx            # トップ + 参加者エントリー + タイムライン（?room=XXX）
│   ├── globals.css         # グローバルスタイル
│   └── admin/
│       ├── page.tsx        # /admin リダイレクト
│       └── [roomId]/
│           └── page.tsx    # 管理者画面（タブ切替: 全パネル/進行集中）
├── lib/
│   ├── firebase.ts         # Firebase初期化 + Anonymous Auth + プレゼンス
│   └── room.ts             # ルーム操作関数（メッセージ・ステップ回答・割り込み・プレゼンス含む）
├── types/
│   └── room.ts             # 型定義（AdminMessage, StepInputConfig, StepResponse 等）
└── components/
    └── admin/
        ├── ScenarioPanel.tsx   # 台本・進行（割り込み・入力設定・回答パネル含む）
        ├── MessageSender.tsx   # 管理者メッセージ送信
        ├── RoomInfoPanel.tsx   # ルーム情報・QR・エントリーフィールド設定
        └── PlayersPanel.tsx    # 参加者モニター・テーブル割り当て
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

## 起動方法

```bash
npm install
npm run dev
```

管理者画面: http://localhost:3000/admin

## 開発方針

**管理画面駆動開発**: 管理者画面を先に完成させ、Firebaseの状態を操作できるようにしてから、参加者画面を実装する。
