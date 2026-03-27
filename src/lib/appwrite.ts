import { Client, Account, Databases } from "appwrite";

// Appwrite 設定
const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "";
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "";

export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || "takenawa";
export const COLLECTION_ROOMS = "rooms";
export const COLLECTION_PLAYERS = "players";
export const COLLECTION_ANSWERS = "answers";

// Client（クライアント側でのみ実行）
let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) {
    _client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
  }
  return _client;
}

// Databases（遅延初期化）
let _databases: Databases | null = null;

export function getDatabases(): Databases {
  if (!_databases) {
    _databases = new Databases(getClient());
  }
  return _databases;
}

// Account（遅延初期化）
let _account: Account | null = null;

function getAccount(): Account {
  if (!_account) {
    _account = new Account(getClient());
  }
  return _account;
}

// 匿名ログイン（既にログイン済みならそのUIDを返す）
export async function ensureAnonymousUser(): Promise<string> {
  const account = getAccount();
  try {
    const user = await account.get();
    return user.$id;
  } catch {
    // セッションなし → 匿名セッション作成
    try {
      await account.createAnonymousSession();
      const user = await account.get();
      return user.$id;
    } catch (e: unknown) {
      // 既にセッションが存在（レースコンディション対策）
      const err = e as { code?: number };
      if (err.code === 409) {
        const user = await account.get();
        return user.$id;
      }
      throw e;
    }
  }
}

// Auth状態の監視（互換性のため）
export function onAuthReady(callback: (userId: string | null) => void): () => void {
  let cancelled = false;
  (async () => {
    try {
      const user = await getAccount().get();
      if (!cancelled) callback(user.$id);
    } catch {
      if (!cancelled) callback(null);
    }
  })();
  return () => { cancelled = true; };
}
