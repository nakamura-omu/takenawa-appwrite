# Appwrite 利用ガイド

## はじめに

Appwrite はオープンソースの BaaS (Backend as a Service) です。
データベース、認証、リアルタイム通信、ストレージなどを API 経由で利用できます。

サーバーサイドのコードを書かなくても、フロントエンドだけでフル機能のアプリが作れます。

---

## 1. プロジェクト作成

### 1.1 コンソールにログイン

```
https://pocketbase.ciist.omu.ac.jp/console
```

Organization に招待されている必要があります。招待が必要な場合は CIIST に連絡してください。

### 1.2 新規プロジェクト

1. **Create Project** をクリック
2. プロジェクト名を入力（例: `my-chat-app`）
3. 作成後、**Project ID** をメモ（SDK の初期化で使います）

### 1.3 プラットフォームの追加

アプリからの API アクセスを許可するために、プラットフォームを登録します。

1. プロジェクト → **Overview** → **Integrations** → **Add platform**
2. **Web** を選択
3. Name: アプリ名（任意）
4. Hostname: `pocketbase.ciist.omu.ac.jp`

> これを設定しないと CORS エラーで API にアクセスできません。

---

## 2. SDK セットアップ

### インストール

```bash
npm install appwrite
```

### 初期化

```typescript
import { Client, Account, Databases } from 'appwrite';

const client = new Client()
  .setEndpoint('https://pocketbase.ciist.omu.ac.jp/v1')
  .setProject('<あなたのプロジェクトID>');

const account = new Account(client);
const databases = new Databases(client);
```

環境変数で管理する場合:

```env
# .env.local
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://pocketbase.ciist.omu.ac.jp/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=<プロジェクトID>
```

```typescript
const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);
```

---

## 3. 認証 (Auth)

### 3.1 匿名認証

ユーザー登録なしで即座に使えます。ゲームや一時的なアプリに最適。

**有効化:** コンソール → Auth → Settings → **Anonymous** を ON

```typescript
// 匿名セッション作成
const session = await account.createAnonymousSession();
console.log(session.userId); // ユーザーID
```

### 3.2 メール・パスワード認証

**有効化:** デフォルトで ON

```typescript
// 新規登録
await account.create('unique()', 'user@example.com', 'password', 'ユーザー名');

// ログイン
const session = await account.createEmailPasswordSession('user@example.com', 'password');

// ログアウト
await account.deleteSession('current');

// 現在のユーザー取得
const user = await account.get();
console.log(user.name, user.email);
```

### 3.3 Microsoft 365 OAuth（大学アカウント）

大学の Microsoft アカウントでログインさせたい場合に使います。
設定方法は [appwrite-wiki.md](../../appwrite-wiki.md) の「Microsoft 365 (OAuth) 認証の設定」を参照。

```typescript
// Microsoft ログインページにリダイレクト
account.createOAuth2Session(
  'microsoft',
  'https://pocketbase.ciist.omu.ac.jp/<アプリ名>/success', // 成功時
  'https://pocketbase.ciist.omu.ac.jp/<アプリ名>/failure', // 失敗時
);
```

---

## 4. データベース (Databases)

### 4.1 概念

```
Database（データベース）
  └── Collection（コレクション）= テーブル
        └── Document（ドキュメント）= 行
              └── Attribute（属性）= カラム
```

### 4.2 スキーマの定義

コンソールで手動作成するか、API / スクリプトで作成します。

**コンソールでの手順:**
1. プロジェクト → **Databases** → **Create database**
2. データベース内 → **Create collection**
3. コレクション内 → **Attributes** → **Create attribute**
4. **Indexes** で検索用インデックスを定義

**スクリプトでの手順:**
Server API Key を使い、REST API または Server SDK で作成。例:

```javascript
// scripts/setup.mjs (Node.js で実行)
const response = await fetch(`${ENDPOINT}/databases`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': PROJECT_ID,
    'X-Appwrite-Key': API_KEY,
  },
  body: JSON.stringify({ databaseId: 'mydb', name: 'My Database' }),
});
```

> Server API Key は コンソール → Settings → API Keys から発行できます。

### 4.3 属性の型

| 型 | 説明 | 例 |
|---|---|---|
| `string` | 文字列（サイズ指定） | 名前、メールアドレス |
| `integer` | 整数 | 年齢、スコア |
| `float` | 浮動小数点 | 座標、価格 |
| `boolean` | 真偽値 | 公開フラグ |
| `enum` | 列挙型 | ステータス (draft/published) |
| `email` | メールアドレス | 連絡先 |
| `datetime` | 日時 | 作成日、期限 |

> **注意:** 1 コレクションあたりの属性サイズ合計は約 **16,000 文字**（MariaDB の制限）。
> 大きなデータは JSON 文字列として 1 つの string 属性に格納するなどの工夫が必要です。

### 4.4 CRUD 操作

```typescript
import { Databases, ID, Query } from 'appwrite';

const databases = new Databases(client);
const DB = 'mydb';
const COLLECTION = 'posts';

// 作成
const doc = await databases.createDocument(DB, COLLECTION, ID.unique(), {
  title: 'Hello World',
  content: '最初の投稿です',
  likes: 0,
});

// 取得（1件）
const post = await databases.getDocument(DB, COLLECTION, doc.$id);

// 一覧取得（クエリ付き）
const posts = await databases.listDocuments(DB, COLLECTION, [
  Query.equal('author', 'user123'),
  Query.orderDesc('$createdAt'),
  Query.limit(10),
]);

// 更新
await databases.updateDocument(DB, COLLECTION, doc.$id, {
  likes: post.likes + 1,
});

// 削除
await databases.deleteDocument(DB, COLLECTION, doc.$id);
```

### 4.5 権限 (Permissions)

誰がドキュメントを読み書きできるかを制御します。

**コレクションレベル** (`documentSecurity: false`):
```
read("users")    — ログイン済み全員が読める
create("users")  — ログイン済み全員が作成できる
update("users")  — ログイン済み全員が更新できる
delete("users")  — ログイン済み全員が削除できる
```

**ドキュメントレベル** (`documentSecurity: true`):
```typescript
import { Permission, Role } from 'appwrite';

await databases.createDocument(DB, COL, ID.unique(), data, [
  Permission.read(Role.any()),           // 誰でも読める
  Permission.update(Role.user(userId)),  // 作成者のみ更新可
  Permission.delete(Role.user(userId)),  // 作成者のみ削除可
]);
```

---

## 5. リアルタイム (Realtime)

WebSocket でドキュメントの変更をリアルタイムに受信できます。
チャット、ゲーム、ダッシュボードなどに最適。

```typescript
// 特定ドキュメントの変更を監視
const unsubscribe = client.subscribe(
  `databases.mydb.collections.messages.documents`,
  (event) => {
    console.log('変更検出:', event.payload);
    console.log('イベント種別:', event.events);
    // event.events: ["databases.mydb.collections.messages.documents.*.create"]
  }
);

// 監視を停止
unsubscribe();
```

### チャンネルの書式

| チャンネル | 受信するイベント |
|---|---|
| `databases.{db}.collections.{col}.documents` | コレクション内の全ドキュメント変更 |
| `databases.{db}.collections.{col}.documents.{docId}` | 特定ドキュメントの変更 |
| `account` | 現在のユーザーアカウントの変更 |

### イベント種別

| イベント | タイミング |
|---|---|
| `*.create` | ドキュメント作成時 |
| `*.update` | ドキュメント更新時 |
| `*.delete` | ドキュメント削除時 |

### React での使い方（例）

```typescript
useEffect(() => {
  const unsubscribe = client.subscribe(
    `databases.mydb.collections.messages.documents`,
    (event) => {
      setMessages(prev => [...prev, event.payload]);
    }
  );
  return () => unsubscribe();
}, []);
```

---

## 6. ストレージ (Storage)

画像やファイルのアップロード・ダウンロードができます。

```typescript
import { Storage, ID } from 'appwrite';

const storage = new Storage(client);

// アップロード
const file = await storage.createFile('bucket-id', ID.unique(), fileInput);

// ダウンロード URL の取得
const url = storage.getFileView('bucket-id', file.$id);

// 削除
await storage.deleteFile('bucket-id', file.$id);
```

---

## 7. よくあるパターン

### パターン 1: 初回アクセスで匿名セッション作成

```typescript
async function ensureSession(): Promise<string> {
  try {
    const user = await account.get();
    return user.$id;
  } catch {
    await account.createAnonymousSession();
    const user = await account.get();
    return user.$id;
  }
}
```

### パターン 2: リアルタイム + 初回フェッチ

Appwrite の Realtime は変更通知のみ（現在のデータは送らない）。
初回データは別途フェッチする必要があります。

```typescript
function subscribeToMessages(callback: (messages: Message[]) => void) {
  // 1. リアルタイム購読開始
  const unsubscribe = client.subscribe(channel, (event) => {
    // 差分更新
  });

  // 2. 初回データ取得
  databases.listDocuments(DB, COL, queries).then(res => {
    callback(res.documents);
  });

  return unsubscribe;
}
```

### パターン 3: 大きなデータを JSON 文字列で格納

属性サイズ制限の回避策:

```typescript
// 格納
await databases.createDocument(DB, COL, id, {
  userId: 'user123',
  data: JSON.stringify({ complex: { nested: { object: true } } }),
});

// 読取
const doc = await databases.getDocument(DB, COL, id);
const data = JSON.parse(doc.data);
```

---

## 8. 参考リンク

- [Appwrite 公式ドキュメント](https://appwrite.io/docs)
- [Appwrite Web SDK リファレンス](https://appwrite.io/docs/references/cloud/client-web)
- [Appwrite GitHub](https://github.com/appwrite/appwrite)
