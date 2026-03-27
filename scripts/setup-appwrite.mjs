#!/usr/bin/env node
/**
 * Appwrite データベースセットアップスクリプト
 *
 * 使い方:
 *   1. Appwrite コンソールでプロジェクト作成 + Server API Key 発行
 *   2. 環境変数を設定:
 *      export APPWRITE_ENDPOINT=https://pocketbase.ciist.omu.ac.jp/v1
 *      export APPWRITE_PROJECT_ID=takenawa
 *      export APPWRITE_API_KEY=<your-api-key>
 *   3. node scripts/setup-appwrite.mjs
 */

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "takenawa";

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error("環境変数を設定してください: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Project": PROJECT_ID,
  "X-Appwrite-Key": API_KEY,
};

async function api(method, path, body) {
  const url = `${ENDPOINT}${path}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok && res.status !== 409) {
    console.error(`  ERROR ${res.status}: ${JSON.stringify(json)}`);
    throw new Error(`API error: ${res.status}`);
  }
  if (res.status === 409) {
    console.log(`  (already exists, skipping)`);
  }
  return json;
}

async function createStringAttr(collId, key, size, required = false) {
  console.log(`  + ${collId}.${key} (string, ${size})`);
  await api("POST", `/databases/${DATABASE_ID}/collections/${collId}/attributes/string`, {
    key, size, required, default: required ? undefined : null,
  });
}

async function createIntAttr(collId, key, required = false) {
  console.log(`  + ${collId}.${key} (integer)`);
  await api("POST", `/databases/${DATABASE_ID}/collections/${collId}/attributes/integer`, {
    key, required, min: 0, max: 9999999999999,
  });
}

async function createBoolAttr(collId, key, required = false, defaultVal = undefined) {
  console.log(`  + ${collId}.${key} (boolean)`);
  const body = { key, required };
  if (!required && defaultVal !== undefined) body.default = defaultVal;
  await api("POST", `/databases/${DATABASE_ID}/collections/${collId}/attributes/boolean`, body);
}

async function createIndex(collId, key, type, attributes, orders) {
  console.log(`  + ${collId} index: ${key}`);
  await api("POST", `/databases/${DATABASE_ID}/collections/${collId}/indexes`, {
    key, type, attributes, orders,
  });
}

async function waitForAttributes(collId) {
  // Appwrite はattribute作成が非同期。少し待ってからindex作成する
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const res = await api("GET", `/databases/${DATABASE_ID}/collections/${collId}/attributes`);
    const attrs = res.attributes || [];
    const allAvailable = attrs.length > 0 && attrs.every(a => a.status === "available");
    if (allAvailable) { ready = true; break; }
    console.log(`  waiting for attributes to be ready... (${attrs.filter(a => a.status === "available").length}/${attrs.length})`);
    await new Promise(r => setTimeout(r, 2000));
  }
  if (!ready) console.warn("  WARNING: attributes may not be ready yet");
}

async function main() {
  console.log("=== Takenawa Appwrite Setup ===\n");

  // 1. Create database
  console.log("1. Creating database...");
  await api("POST", "/databases", { databaseId: DATABASE_ID, name: "Takenawa" });

  // 2. Create rooms collection (documentSecurity: false = collection-level permissions)
  console.log("\n2. Creating rooms collection...");
  await api("POST", `/databases/${DATABASE_ID}/collections`, {
    collectionId: "rooms",
    name: "rooms",
    documentSecurity: false,
    permissions: [
      'read("users")', 'create("users")', 'update("users")', 'delete("users")',
    ],
  });

  // Room attributes (MariaDB VARCHAR上限のため2属性に統合)
  // creatorUid: インデックス用に独立
  // data: ルーム全データをJSON文字列で格納
  await createStringAttr("rooms", "creatorUid", 36);
  await createStringAttr("rooms", "data", 16000, true);

  await waitForAttributes("rooms");
  await createIndex("rooms", "idx_creatorUid", "key", ["creatorUid"], ["ASC"]);

  // 3. Create players collection
  console.log("\n3. Creating players collection...");
  await api("POST", `/databases/${DATABASE_ID}/collections`, {
    collectionId: "players",
    name: "players",
    documentSecurity: false,
    permissions: [
      'read("users")', 'create("users")', 'update("users")', 'delete("users")',
    ],
  });

  await createStringAttr("players", "roomId", 20, true);
  await createStringAttr("players", "name", 255, true);
  await createIntAttr("players", "tableNumber", true);
  await createBoolAttr("players", "connected", true, false);
  await createIntAttr("players", "joinedAt", true);
  await createStringAttr("players", "fields", 4000);

  await waitForAttributes("players");
  await createIndex("players", "idx_roomId", "key", ["roomId"], ["ASC"]);

  // 4. Create answers collection
  console.log("\n4. Creating answers collection...");
  await api("POST", `/databases/${DATABASE_ID}/collections`, {
    collectionId: "answers",
    name: "answers",
    documentSecurity: false,
    permissions: [
      'read("users")', 'create("users")', 'update("users")', 'delete("users")',
    ],
  });

  await createStringAttr("answers", "roomId", 20, true);
  await createStringAttr("answers", "questionId", 50, true);
  await createStringAttr("answers", "playerId", 50, true);
  await createStringAttr("answers", "text", 2000, true);
  await createIntAttr("answers", "submittedAt", true);

  await waitForAttributes("answers");
  await createIndex("answers", "idx_roomId_qId", "key", ["roomId", "questionId"], ["ASC", "ASC"]);

  console.log("\n=== Setup complete! ===");
  console.log(`Database: ${DATABASE_ID}`);
  console.log("Collections: rooms, players, answers");
}

main().catch((e) => {
  console.error("Setup failed:", e);
  process.exit(1);
});
