# Coolify インストール・デプロイ手順

## Coolify とは

Coolify はセルフホスト型の PaaS (Platform as a Service) です。
Vercel や Netlify のように GitHub リポジトリからワンクリックでデプロイできます。

---

## 1. Coolify のインストール

### 前提条件
- Docker がインストール済み
- sudo 権限

### インストールコマンド

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

### ポート変更（Appwrite と共存する場合）

Coolify のダッシュボードはデフォルトで port 8000 を使いますが、Appwrite の Traefik が既に 8000 を使用しています。

**インストール後に port 8080 に変更:**

```bash
# APP_PORT を .env に追加
echo 'APP_PORT=8080' | sudo tee -a /data/coolify/source/.env

# コンテナを再作成
sudo docker compose \
  -f /data/coolify/source/docker-compose.yml \
  -f /data/coolify/source/docker-compose.prod.yml \
  --env-file /data/coolify/source/.env \
  -p source up -d --force-recreate coolify
```

### 動作確認

```bash
docker ps --filter "name=coolify" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

```
NAMES              STATUS                    PORTS
coolify            Up X minutes (healthy)    0.0.0.0:8080->8080/tcp
coolify-realtime   Up X minutes (healthy)    0.0.0.0:6001-6002->6001-6002/tcp
coolify-db         Up X minutes (healthy)    5432/tcp
coolify-redis      Up X minutes (healthy)    6379/tcp
```

### ダッシュボードアクセス

```
http://10.159.42.16:8080
```

初回アクセスで管理者アカウントを作成します。

---

## 2. Docker ネットワーク接続（初回のみ）

Coolify がデプロイするコンテナと Appwrite の Traefik を通信可能にします。
**これは 1 回だけ実行すれば OK です。**

```bash
sudo docker network connect coolify appwrite-traefik
```

確認:
```bash
docker inspect appwrite-traefik --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
# 出力: appwrite coolify gateway
```

> **注意:** Appwrite の Traefik コンテナが再起動された場合、このネットワーク接続がリセットされます。
> その場合は再度実行してください。

---

## 3. Takenawa のデプロイ

### 3.1 プロジェクト作成

1. Coolify ダッシュボード → **Projects** → **Add**
2. プロジェクト名: `Takenawa`

### 3.2 リソース追加

1. プロジェクト内 → **+ New** → **Public Repository**
2. Repository URL: `https://github.com/nakamura-omu/takenawa-appwrite`
3. Branch: `master`
4. Build Pack: **Nixpacks**（自動検出）

### 3.3 環境変数の設定

**Environment Variables** セクションに以下を追加:

```
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://pocketbase.ciist.omu.ac.jp/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=69a921f10034a15b22c7
NEXT_PUBLIC_APPWRITE_DATABASE_ID=takenawa
```

### 3.4 カスタム Docker ラベルの設定

Coolify が自動生成するラベルを**全て削除**し、以下に置き換えます:

```
traefik.enable=true
traefik.constraint-label-stack=appwrite
traefik.http.routers.takenawa.rule=PathPrefix(`/takenawa`)
traefik.http.routers.takenawa.entrypoints=appwrite_web
traefik.http.services.takenawa.loadbalancer.server.port=3000
```

> これにより、Appwrite の Traefik がこのコンテナを自動検出し、
> `/takenawa` へのリクエストを転送します。

### 3.5 デプロイ

**Deploy** ボタンをクリック。初回は npm install + ビルドで 2-3 分かかります。

### 3.6 動作確認

```
https://pocketbase.ciist.omu.ac.jp/takenawa
```

---

## 4. 再デプロイ

コードを変更して GitHub に push した後:

1. Coolify ダッシュボード → Takenawa プロジェクト
2. **Redeploy** ボタンをクリック

Docker ラベル方式のおかげで、Traefik の設定変更は**一切不要**です。

---

## 5. 他のアプリを追加する場合

同じパターンで他の Web アプリもデプロイできます。

### 手順

1. Coolify で **+ New** → リポジトリを指定
2. 環境変数を設定
3. Docker ラベルを設定（パスを変更）:

```
traefik.enable=true
traefik.constraint-label-stack=appwrite
traefik.http.routers.<アプリ名>.rule=PathPrefix(`/<パス>`)
traefik.http.routers.<アプリ名>.entrypoints=appwrite_web
traefik.http.services.<アプリ名>.loadbalancer.server.port=<ポート>
```

4. Next.js の場合は `next.config.ts` に `basePath: "/<パス>"` を設定
5. Deploy

> `docker network connect coolify appwrite-traefik` は初回のみ。
> 2つ目以降のアプリでは不要です。

---

## トラブルシューティング

### デプロイが失敗する (exit code 255)

**原因:** メモリ不足の可能性が高い

```bash
free -h  # メモリ確認
```

available が 2GB 以下の場合、ビルド中に OOM で kill されることがあります。
サーバーのメモリを増やすか、不要なコンテナを停止してください。

### Bad Gateway になる

**原因 1:** Docker ネットワーク接続が切れている
```bash
docker inspect appwrite-traefik --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
# "coolify" が含まれていなければ再接続:
sudo docker network connect coolify appwrite-traefik
```

**原因 2:** Docker ラベルが正しくない
```bash
CONTAINER=$(docker ps --format "{{.Names}}" | grep <アプリID> | head -1)
docker inspect "$CONTAINER" --format '{{json .Config.Labels}}' | python3 -m json.tool | grep traefik
```

### Branch が見つからないエラー

Coolify のブランチ設定が `main` になっていないか確認。
このリポジトリのデフォルトブランチは `master` です。
