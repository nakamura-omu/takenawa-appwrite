# Coolify デプロイガイド

## Coolify とは

Coolify はセルフホスト型の PaaS (Platform as a Service) です。
GitHub リポジトリを接続して **ボタン1つでデプロイ** できます。Vercel や Netlify の代替です。

---

## ダッシュボード

```
http://10.159.42.16:8080
```

> 学内ネットワークからのみアクセス可能です。
> アカウントが必要な場合は CIIST に連絡してください。

---

## アプリのデプロイ手順

### Step 1: GitHub にリポジトリを用意

アプリのソースコードを GitHub の **Public Repository** に push してください。

> Private Repository の場合は Coolify に GitHub App 連携の設定が必要です。

### Step 2: プロジェクト作成

1. Coolify ダッシュボード → **Projects** → **Add**
2. プロジェクト名を入力（例: `my-app`）

### Step 3: リソース追加

1. プロジェクト内 → **+ New** → **Public Repository**
2. **Repository URL**: `https://github.com/<ユーザー>/<リポジトリ>`
3. **Branch**: `main` または `master`（リポジトリに合わせて）
4. **Build Pack**: **Nixpacks**（大抵は自動検出で OK）

### Step 4: 環境変数の設定

**Environment Variables** セクションに、アプリが必要とする環境変数を追加します。

Appwrite を使うアプリの場合:
```
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://pocketbase.ciist.omu.ac.jp/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=<プロジェクトID>
NEXT_PUBLIC_APPWRITE_DATABASE_ID=<データベースID>
```

### Step 5: Docker ラベルの設定

Coolify が自動生成するラベルを**全て削除**し、以下に置き換えます:

```
traefik.enable=true
traefik.constraint-label-stack=appwrite
traefik.http.routers.<アプリ名>.rule=PathPrefix(`/<パス>`)
traefik.http.routers.<アプリ名>.entrypoints=appwrite_web
traefik.http.services.<アプリ名>.loadbalancer.server.port=<ポート>
```

**例:** `my-chat` というアプリを `/chat` で公開する場合:
```
traefik.enable=true
traefik.constraint-label-stack=appwrite
traefik.http.routers.my-chat.rule=PathPrefix(`/chat`)
traefik.http.routers.my-chat.entrypoints=appwrite_web
traefik.http.services.my-chat.loadbalancer.server.port=3000
```

> **ポート番号:** Next.js = `3000`, Vite = `5173`, Flask = `5000` など。
> フレームワークのデフォルトポートに合わせてください。

> **詳細:** [03-traefik-routing.md](./03-traefik-routing.md) を参照

### Step 6: デプロイ

**Deploy** ボタンをクリック。ビルドログがリアルタイムで表示されます。

### Step 7: 動作確認

```
https://pocketbase.ciist.omu.ac.jp/<パス>
```

---

## 再デプロイ

コードを変更して GitHub に push した後:

1. Coolify ダッシュボード → プロジェクト
2. **Redeploy** をクリック

Docker ラベル方式なので **Traefik の設定変更は不要** です。自動で反映されます。

---

## フレームワーク別の注意点

### Next.js

#### basePath の設定

パスベースルーティング (`/myapp`) で公開する場合、`next.config.ts` に `basePath` を追加:

```typescript
const nextConfig: NextConfig = {
  basePath: "/myapp",
};
```

#### 手動 URL の修正

`basePath` は `<Link>` や `router.push()` には自動適用されますが、
`window.location.origin` で手動構築する URL には適用されません:

```typescript
// NG
const url = `${window.location.origin}/page`;

// OK
const url = `${window.location.origin}/myapp/page`;
```

#### standalone モード（推奨）

Docker でのビルドサイズを最適化:

```typescript
const nextConfig: NextConfig = {
  basePath: "/myapp",
  output: "standalone",
};
```

### Vite (React / Vue)

#### base の設定

`vite.config.ts`:
```typescript
export default defineConfig({
  base: '/myapp/',
});
```

### 静的サイト (HTML/CSS/JS)

Nixpacks が自動で nginx を設定します。特別な設定は不要です。

---

## トラブルシューティング

### ビルドが失敗する

| 症状 | 原因 | 対処 |
|---|---|---|
| exit code 255 | メモリ不足 (OOM) | もう一度 Redeploy。繰り返すならサーバーメモリを確認 |
| branch not found | ブランチ名の不一致 | `main` / `master` を確認 |
| npm install fails | package-lock.json の不整合 | ローカルで `npm install` し直して push |

### Bad Gateway

| 原因 | 対処 |
|---|---|
| Docker ネットワーク切断 | `sudo docker network connect coolify appwrite-traefik` |
| ラベル設定ミス | `traefik.constraint-label-stack=appwrite` があるか確認 |
| アプリが起動していない | Coolify のログでエラーを確認 |

### ラベルの確認方法

```bash
CONTAINER=$(docker ps --format "{{.Names}}" | grep <アプリID> | head -1)
docker inspect "$CONTAINER" --format '{{json .Config.Labels}}' | python3 -m json.tool | grep traefik
```

---

## 補足: Coolify の管理者向け情報

### インストール

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

### ポート変更（Appwrite と共存）

```bash
echo 'APP_PORT=8080' | sudo tee -a /data/coolify/source/.env

sudo docker compose \
  -f /data/coolify/source/docker-compose.yml \
  -f /data/coolify/source/docker-compose.prod.yml \
  --env-file /data/coolify/source/.env \
  -p source up -d --force-recreate coolify
```

### Docker ネットワーク接続（初回のみ）

```bash
sudo docker network connect coolify appwrite-traefik
```

> Appwrite の Traefik が再起動された場合は再実行が必要です。
