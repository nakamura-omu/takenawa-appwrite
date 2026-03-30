# Appwrite プロジェクト・DB セットアップ

## 前提条件

- Appwrite v1.8.1 がセルフホストで稼働中
- 管理コンソール: `https://pocketbase.ciist.omu.ac.jp/console`
- API エンドポイント: `https://pocketbase.ciist.omu.ac.jp/v1`

---

## 1. プロジェクト作成

1. Appwrite コンソールにログイン
2. **Create Project** をクリック
3. プロジェクト名: `Takenawa`（任意）
4. プロジェクト ID: 自動生成（メモしておく）

> 今回の環境では Project ID = `69a921f10034a15b22c7`

---

## 2. Anonymous Auth の有効化

1. プロジェクト内 → **Auth** → **Settings**
2. **Anonymous** セクションを見つけて **有効** にする
3. 保存

これにより、ユーザー登録なしで匿名セッションが作成可能になります。

---

## 3. プラットフォームの追加

1. プロジェクト → **Overview** → **Integrations** → **Add platform**
2. **Web** を選択
3. Name: `Takenawa Web`
4. Hostname: `pocketbase.ciist.omu.ac.jp`

> これを設定しないと、ブラウザからの API リクエストが CORS でブロックされます。

---

## 4. API Key の作成

セットアップスクリプト用に Server API Key が必要です。

1. プロジェクト → **Settings** → **API Keys** → **Create API Key**
2. Name: `setup`
3. Scopes: **databases** 関連を全てチェック（または全スコープ）
4. **Secret** の値をコピー

> セットアップ完了後、この Key は削除しても構いません。

---

## 5. データベースセットアップスクリプトの実行

リポジトリに含まれる `scripts/setup-appwrite.mjs` が DB・コレクション・属性・インデックスを一括作成します。

### 実行方法

```bash
export APPWRITE_ENDPOINT=https://pocketbase.ciist.omu.ac.jp/v1
export APPWRITE_PROJECT_ID=<プロジェクトID>
export APPWRITE_API_KEY=<APIキー>

node scripts/setup-appwrite.mjs
```

### 成功時の出力

```
=== Takenawa Appwrite Setup ===

1. Creating database...
2. Creating rooms collection...
  + rooms.creatorUid (string, 36)
  + rooms.data (string, 16000)
  + rooms index: idx_creatorUid
3. Creating players collection...
  + players.roomId (string, 20)
  + players.name (string, 255)
  + players.tableNumber (integer)
  + players.connected (boolean)
  + players.joinedAt (integer)
  + players.fields (string, 4000)
  + players index: idx_roomId
4. Creating answers collection...
  + answers.roomId (string, 20)
  + answers.questionId (string, 50)
  + answers.playerId (string, 50)
  + answers.text (string, 2000)
  + answers.submittedAt (integer)
  + answers index: idx_roomId_qId

=== Setup complete! ===
```

---

## 6. 作成されるスキーマ

### Database: `takenawa`

### Collection: `rooms`

ルームの全データを `data` 属性に JSON 文字列として格納する設計です。
これは Appwrite (MariaDB) の VARCHAR 合計サイズ制限 (~16,000文字) への対応です。

| 属性 | 型 | サイズ | 説明 |
|---|---|---|---|
| `creatorUid` | string | 36 | ルーム作成者の UID（インデックス用） |
| `data` | string | 16000 | ルーム全データの JSON 文字列 |

**Index:** `creatorUid` (key) — マイルーム検索用

**`data` に含まれる内容:**
- `config` — イベント名、日時、テーブル数、パスワード等
- `state` — 現在のステップ、フェーズ
- `scenario` — 台本（ステップ一覧）
- `currentGame` — 進行中のゲーム状態
- `messages` — 管理者メッセージ
- `gameResults` — ゲーム結果アーカイブ
- `stepResponses` — アンケート回答
- `stepReveals` / `revealVisibility` — 開示設定
- `publishedTables` / `publishHistory` — テーブル割当

### Collection: `players`

| 属性 | 型 | サイズ | 説明 |
|---|---|---|---|
| `roomId` | string | 20 | 所属ルーム ID |
| `name` | string | 255 | 参加者名 |
| `tableNumber` | integer | — | テーブル番号 (0=未割当) |
| `connected` | boolean | — | 接続状態 |
| `joinedAt` | integer | — | 参加時刻 (epoch ms) |
| `fields` | string | 4000 | カスタムフィールド JSON |

**Index:** `roomId` (key)

### Collection: `answers`

| 属性 | 型 | サイズ | 説明 |
|---|---|---|---|
| `roomId` | string | 20 | ルーム ID |
| `questionId` | string | 50 | お題 ID |
| `playerId` | string | 50 | 回答者 ID |
| `text` | string | 2000 | 回答テキスト |
| `submittedAt` | integer | — | 送信時刻 (epoch ms) |

**Index:** `roomId + questionId` (key)

### 権限設定

全コレクション共通（コレクションレベル、`documentSecurity: false`）:
- `read("users")` — 認証済みユーザーは全ドキュメント読取可
- `create("users")` — 認証済みユーザーはドキュメント作成可
- `update("users")` — 認証済みユーザーはドキュメント更新可
- `delete("users")` — 認証済みユーザーはドキュメント削除可

> 匿名セッションも「認証済みユーザー」として扱われます。

---

## 7. 環境変数

アプリケーション側で必要な環境変数:

```env
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://pocketbase.ciist.omu.ac.jp/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=69a921f10034a15b22c7
NEXT_PUBLIC_APPWRITE_DATABASE_ID=takenawa
```

これらは Coolify のデプロイ設定で環境変数として設定します。
