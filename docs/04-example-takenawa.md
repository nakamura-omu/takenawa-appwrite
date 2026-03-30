# 実例: Takenawa (Firebase → Appwrite 移植)

## 概要

Takenawa は宴会・懇親会の進行を補助する Web アプリです。
管理者が台本に沿ってイベントを進行し、参加者はスマホから QR コードでゲームに参加します。

元々は Firebase (Realtime Database + Anonymous Auth) + Vercel でホストされていましたが、
全機能を Appwrite + Coolify に移植しました。

- **元リポジトリ:** https://github.com/yupika/takenawa
- **Appwrite版:** https://github.com/nakamura-omu/takenawa-appwrite
- **デモ URL:** https://pocketbase.ciist.omu.ac.jp/takenawa

---

## 使用している Appwrite 機能

| 機能 | 用途 |
|---|---|
| Anonymous Sessions | ユーザー登録なしで参加者を識別 |
| Databases | ルーム・参加者・回答データの永続化 |
| Realtime | 管理者↔参加者間のリアルタイム同期 |

---

## データモデル

### 3 コレクション設計

```
[rooms]  1ルーム = 1ドキュメント
  ├── creatorUid: 作成者UID（検索用）
  └── data: ルーム全データ（JSON文字列）
              ├── config（イベント名、テーブル数等）
              ├── state（現在のステップ、フェーズ）
              ├── scenario（台本）
              ├── currentGame（進行中のゲーム状態）
              ├── messages（管理者メッセージ）
              └── ...

[players]  1参加者 = 1ドキュメント
  ├── roomId, name, tableNumber
  ├── connected（接続状態）
  └── fields（カスタム入力項目）

[answers]  1回答 = 1ドキュメント
  ├── roomId, questionId, playerId
  └── text, submittedAt
```

### なぜ rooms を 1 つの JSON にまとめたか

Appwrite (MariaDB) には 1 コレクションあたりの VARCHAR 合計サイズ制限（~16,000文字）があります。
ルームには 12 種類のデータがあるため、個別属性に分けると制限を超えてしまいます。
`creatorUid`（検索用）と `data`（全データの JSON）の 2 属性に統合することで制限内に収めています。

### なぜ players と answers を分離したか

参加者の入場（join）やゲーム回答は 50 人が同時に行います。
1 つのドキュメントに read-modify-write すると競合が発生するため、
1 参加者 = 1 ドキュメント、1 回答 = 1 ドキュメントとして分離しています。

---

## Firebase → Appwrite の主な変換

### リアルタイム同期

Firebase:
```typescript
onValue(ref(db, `rooms/${roomId}`), (snapshot) => {
  callback(snapshot.val());
});
```

Appwrite (3チャンネル購読 → Room 組み立て):
```typescript
// ルームドキュメント
client.subscribe(`databases.DB.collections.rooms.documents.${roomId}`, ...);
// プレイヤー
client.subscribe(`databases.DB.collections.players.documents`, ...);
// 回答
client.subscribe(`databases.DB.collections.answers.documents`, ...);

// 3つの結果を Room オブジェクトにマージして callback
```

### マルチパス更新

Firebase:
```typescript
update(roomRef, {
  "state/currentStep": 3,
  "state/phase": "waiting",
  "currentGame": null,
});
```

Appwrite (data フィールドで一括更新):
```typescript
await updateRoomData(roomId, (data) => {
  data.state.currentStep = 3;
  data.state.phase = "waiting";
  data.currentGame = undefined;
});
```

### プレゼンス

Firebase: `onDisconnect().set(false)` — サーバー側で TCP 切断を検出

Appwrite: `beforeunload` + `visibilitychange` イベント — クライアント側で検出

---

## 変更量のまとめ

| 区分 | ファイル数 | 変更内容 |
|---|---|---|
| 新規作成 | 2 | `appwrite.ts`, `setup-appwrite.mjs` |
| 全面書き換え | 1 | `room.ts`（60+ 関数） |
| import 変更のみ | 3 | EntryForm, admin page, home page |
| 小規模変更 | 1 | GameQuestion.tsx |
| 削除 | 1 | `firebase.ts` |
| **変更なし** | **全 UI コンポーネント** | Room 型が同じなので影響なし |

**ポイント:** `types/room.ts` の `Room` インターフェースを変更しなかったことで、
UI コンポーネントへの影響をほぼゼロに抑えられました。

---

## デプロイ設定

### Coolify 環境変数

```
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://pocketbase.ciist.omu.ac.jp/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=69a921f10034a15b22c7
NEXT_PUBLIC_APPWRITE_DATABASE_ID=takenawa
```

### Coolify Docker ラベル

```
traefik.enable=true
traefik.constraint-label-stack=appwrite
traefik.http.routers.takenawa.rule=PathPrefix(`/takenawa`)
traefik.http.routers.takenawa.entrypoints=appwrite_web
traefik.http.services.takenawa.loadbalancer.server.port=3000
```

### next.config.ts

```typescript
const nextConfig: NextConfig = {
  basePath: "/takenawa",
  output: "standalone",
};
```

---

## 参考: アプリの機能一覧

- ルーム作成 / QR コード生成
- 参加者入場（カスタム入力項目対応）
- 台本ベースの進行管理
- 5 種類のゲーム（チューニングガム、いい線行きましょう、みんなのイーブン、くるっくりん、メタストリームス）
- テーブル割当・シャッフル
- リアルタイムスコアボード
- 管理者メッセージ配信
- アンケート集計
