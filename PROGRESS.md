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

## 未実装（次のステップ）

### 管理者画面の追加機能
- [ ] 台本エディタ（ステップの追加・削除・編集・並び替え）
- [ ] プリセットお題集の選択UI
- [ ] 回答一覧表示
- [ ] スコア集計・表示

### 参加者画面 (`/`, `/play`)
- [ ] エントリー画面（名前・テーブル番号入力）
- [ ] ゲーム画面（お題表示、回答入力）
- [ ] 結果表示画面
- [ ] 歓談タイム画面
- [ ] ストリームス（全体ゲーム）UI

## ファイル構成

```
src/
├── app/
│   ├── layout.tsx          # 共通レイアウト
│   ├── page.tsx            # トップ（参加者エントリー予定）
│   ├── globals.css         # グローバルスタイル
│   └── admin/
│       └── page.tsx        # 管理者画面
├── lib/
│   ├── firebase.ts         # Firebase初期化
│   └── room.ts             # ルーム操作関数
├── types/
│   └── room.ts             # 型定義
└── components/             # （まだ空）
```

## 環境設定

### 必要なファイル
- `.env.local` - Firebase設定（`.env.local.example`を参考に作成）

### Firebase設定
1. Firebase Console でプロジェクト作成済み
2. Realtime Database 有効化済み
3. セキュリティルール: 開発用に読み書き許可

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
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
