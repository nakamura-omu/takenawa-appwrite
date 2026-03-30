# Firebase → Appwrite 移植ガイド

## 概要

Takenawa のバックエンドを Firebase (Realtime Database + Anonymous Auth) から Appwrite (Databases + Anonymous Sessions + Realtime) に移植しました。

**変更の原則:** UI コンポーネントへの影響を最小限にし、データ層 (`room.ts`, `appwrite.ts`) で全て吸収する。

---

## 変更ファイル一覧

| 区分 | ファイル | 変更内容 |
|---|---|---|
| **新規** | `src/lib/appwrite.ts` | Appwrite Client/Account/Databases 初期化 |
| **新規** | `scripts/setup-appwrite.mjs` | DB スキーマ一括作成スクリプト |
| **新規** | `.env.local.example` | Appwrite 用環境変数テンプレート |
| **全面書換** | `src/lib/room.ts` | 全 60+ 関数を Appwrite 実装に変換 |
| **1行変更** | `src/components/player/EntryForm.tsx` | import パス変更 |
| **1行変更** | `src/app/page.tsx` | import パス変更 |
| **1行変更** | `src/app/admin/[roomId]/page.tsx` | import パス変更 + URL 修正 |
| **小規模変更** | `src/components/player/GameQuestion.tsx` | Firebase 直接操作を room.ts に移動 |
| **削除** | `src/lib/firebase.ts` | 不要に |
| **変更なし** | `src/types/room.ts` | Room 型定義はそのまま |

---

## 機能マッピング

### 認証

| Firebase | Appwrite |
|---|---|
| `signInAnonymously(auth)` | `account.createAnonymousSession()` |
| `auth.currentUser.uid` | `account.get().$id` |
| `onAuthStateChanged()` | `account.get()` (ワンショット) |

**実装:** `src/lib/appwrite.ts` の `ensureAnonymousUser()`

### データベース読み書き

| Firebase | Appwrite |
|---|---|
| `set(ref(db, path), data)` | `databases.updateDocument(DB, COL, docId, { data: JSON.stringify(...) })` |
| `get(ref(db, path))` | `databases.getDocument(DB, COL, docId)` |
| `update(ref, { multi/path: val })` | `updateRoomData(roomId, d => { d.field = val })` ヘルパー |
| `push(ref)` → auto ID | `databases.createDocument(DB, COL, ID.unique(), ...)` |
| `set(ref, null)` → 削除 | `databases.deleteDocument(DB, COL, docId)` |
| `query() + orderByChild()` | `databases.listDocuments(DB, COL, [Query.equal(...)])` |

### リアルタイム同期

| Firebase | Appwrite |
|---|---|
| `onValue(ref, callback)` | `client.subscribe(channel, callback)` |
| 1パスで全データ取得 | 3チャンネル購読 → Room オブジェクト組み立て |

**Appwrite 版の `subscribeToRoom()` の仕組み:**

```
┌─ Channel 1: rooms/{roomId} ドキュメント変更 ─┐
│  Channel 2: players コレクション変更          ├→ assembleRoom() → callback(room)
│  Channel 3: answers コレクション変更          │
└─ + 初回フェッチ (3つ並列)                    ─┘
```

### プレゼンス（接続状態）

| Firebase | Appwrite |
|---|---|
| `.info/connected` + `onDisconnect()` | `beforeunload` + `visibilitychange` イベント |
| サーバー側で TCP 切断検出 | クライアント側イベント検出 |

**制約:** ブラウザクラッシュ時に `connected: true` が残る可能性あり（デモ用途では許容範囲）

---

## データモデルの変換

### Firebase (JSON ツリー)
```
rooms/{roomId}/
  config/eventName: "忘年会"
  config/tableCount: 6
  state/currentStep: 2
  players/{playerId}/name: "田中"
  currentGame/answers/{qId}/{pId}/text: "回答"
  ...
```

### Appwrite (3 コレクション)
```
[rooms コレクション]
  Document ID: roomId
  creatorUid: "user123"
  data: '{"config":{"eventName":"忘年会","tableCount":6},"state":{"currentStep":2},...}'

[players コレクション]
  Document ID: auto
  roomId: "AB12345"
  name: "田中"
  tableNumber: 3
  ...

[answers コレクション]
  Document ID: auto
  roomId: "AB12345"
  questionId: "q_1234567890_0"
  playerId: "player123"
  text: "回答"
```

### なぜ `data` を1つの JSON 文字列にしたか

Appwrite の MariaDB バックエンドには VARCHAR 合計サイズの制限（~16,000文字 / コレクション）があります。
属性を個別に定義すると 12 属性で制限を超えるため、`creatorUid`（検索用）と `data`（全データ）の 2 属性に統合しました。

---

## room.ts の設計パターン

### `updateRoomData` ヘルパー

ほぼ全ての更新関数はこのパターンに統一されています:

```typescript
async function updateRoomData(
  roomId: string,
  updater: (data: RoomData) => void,
): Promise<void> {
  const doc = await getRoomDoc(roomId);
  if (!doc) return;
  const data = parseRoomData(doc);
  if (!data) return;
  updater(data);  // データをミュータブルに変更
  await getDatabases().updateDocument(DATABASE_ID, COLLECTION_ROOMS, roomId, {
    data: toJson(data),
  });
}
```

**使用例:**
```typescript
// テーブル数の更新
export async function updateTableCount(roomId: string, count: number): Promise<void> {
  await updateRoomData(roomId, d => { d.config.tableCount = count; });
}

// ステップ進行
export async function goToPrevStep(roomId: string): Promise<void> {
  await updateRoomData(roomId, d => {
    if (d.state.currentStep <= 0) return;
    const prevStep = d.state.currentStep - 1;
    d.state = { ...d.state, currentStep: prevStep, phase: "waiting" };
  });
}
```

### 同時書き込みの安全性

| 操作 | 書き込み先 | 同時性 | 安全性 |
|---|---|---|---|
| ルーム設定変更 | rooms ドキュメント | 管理者のみ（逐次） | 安全 |
| ゲーム操作 | rooms ドキュメント | 管理者のみ（逐次） | 安全 |
| 参加者入場 | players コレクション | 同時多数 | 安全（別ドキュメント） |
| 回答送信 | answers コレクション | 同時多数 | 安全（別ドキュメント） |
| アンケート回答 | rooms ドキュメント | 低頻度 | 実用上安全 |

---

## 他のアプリを移植する場合のポイント

1. **Firebase SDK の import を `appwrite` に置換**
2. **`onValue()` → `client.subscribe()` + 初回フェッチ** のパターンで置換
3. **同時書き込みが多いデータは別コレクションに分離**
4. **VARCHAR 制限に注意** — 大きなデータは JSON 文字列として 1 属性に統合
5. **`onDisconnect()` は代替手段が必要** — クライアントイベントまたは定期チェック
