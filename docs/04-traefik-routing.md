# Traefik パスベースルーティング設定

## 概要

Appwrite に同梱されている Traefik をリバースプロキシとして活用し、
同じドメイン (`pocketbase.ciist.omu.ac.jp`) 配下で複数のアプリを
パスベースで振り分けます。

```
pocketbase.ciist.omu.ac.jp
  ├─ /v1/*       → Appwrite API        (Docker ラベルで設定済み)
  ├─ /console/*  → Appwrite Console    (Docker ラベルで設定済み)
  └─ /takenawa/* → Takenawa Next.js    (Coolify + カスタムラベル)
```

---

## Traefik の構成

Appwrite の Traefik は以下の設定で動作しています:

| 設定 | 値 |
|---|---|
| Docker Provider | 有効 (`--providers.docker=true`) |
| Docker 制約 | `Label('traefik.constraint-label-stack','appwrite')` |
| File Provider | 有効 (`--providers.file.directory=/storage/config`) |
| エントリポイント | `appwrite_web` (port 80) |
| ホスト側ポート | 8000 |
| ネットワーク | `appwrite`, `coolify` (手動接続), `gateway` |

### ポイント

- **Docker Provider の制約**: `traefik.constraint-label-stack=appwrite` ラベルを持つコンテナのみ自動検出
- **File Provider**: `/storage/config/` 内の YAML ファイルも読み込み（ファイル変更を自動監視）
- **エントリポイント**: 学内 LB が SSL を終端し、port 8000 に HTTP で転送

---

## 方式 1: Docker ラベル方式（推奨）

Coolify でデプロイするアプリに Docker ラベルを付与し、Traefik に自動検出させます。

### 前提条件

Traefik が `coolify` ネットワークに接続済みであること:

```bash
# 確認
docker inspect appwrite-traefik --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
# "coolify" が含まれていなければ:
sudo docker network connect coolify appwrite-traefik
```

### ラベル設定

Coolify のリソース設定 → **Docker Labels** を以下に設定:

```
traefik.enable=true
traefik.constraint-label-stack=appwrite
traefik.http.routers.<アプリ名>.rule=PathPrefix(`/<パス>`)
traefik.http.routers.<アプリ名>.entrypoints=appwrite_web
traefik.http.services.<アプリ名>.loadbalancer.server.port=<ポート>
```

### Takenawa の例

```
traefik.enable=true
traefik.constraint-label-stack=appwrite
traefik.http.routers.takenawa.rule=PathPrefix(`/takenawa`)
traefik.http.routers.takenawa.entrypoints=appwrite_web
traefik.http.services.takenawa.loadbalancer.server.port=3000
```

### メリット

- 再デプロイ時に Traefik が自動でコンテナを再検出
- 手動設定が一切不要
- Coolify の管理画面で一元管理

---

## 方式 2: File Provider 方式（手動）

Docker ラベルが使えない場合のフォールバック方式です。

### 設定ファイルの配置

Traefik の File Provider ディレクトリに YAML を配置します:

```bash
# 設定ファイルの場所
/var/lib/docker/volumes/appwrite_appwrite-config/_data/

# コンテナ内のパス（Traefik から見たパス）
/storage/config/
```

### 設定例

```yaml
# /var/lib/docker/volumes/appwrite_appwrite-config/_data/takenawa.yml
http:
  routers:
    takenawa:
      rule: "PathPrefix(`/takenawa`)"
      entryPoints:
        - appwrite_web
      service: takenawa
  services:
    takenawa:
      loadBalancer:
        servers:
          - url: "http://<コンテナ名>:3000"
```

### 適用

```bash
# ファイルを配置（sudo 必要）
sudo cp takenawa.yml /var/lib/docker/volumes/appwrite_appwrite-config/_data/

# Traefik は自動で検知（file watch 有効）→ 再起動不要
```

### 注意点

- Coolify で再デプロイするとコンテナ名が変わるため、設定ファイルの更新が必要
- Docker ラベル方式で解決できるなら、そちらを推奨

---

## Next.js の basePath 設定

パスベースルーティングを使う場合、Next.js 側でも `basePath` の設定が必要です。

### next.config.ts

```typescript
const nextConfig: NextConfig = {
  basePath: "/takenawa",
  output: "standalone",
};
```

### 注意点

- `basePath` を設定すると、`<Link>` や `router.push()` には自動で basePath が付与される
- **手動で URL を構築している箇所は修正が必要:**

```typescript
// NG: basePath が付かない
const url = `${window.location.origin}/?room=${roomId}`;

// OK: basePath を含める
const url = `${window.location.origin}/takenawa?room=${roomId}`;
```

- QR コード生成、リダイレクト先、外部リンク等を確認すること

---

## 新しいアプリを追加するチェックリスト

1. [ ] Coolify でリポジトリを追加
2. [ ] 環境変数を設定
3. [ ] Docker ラベルにルーティング設定を追加
4. [ ] `traefik.constraint-label-stack=appwrite` を含めること
5. [ ] Next.js なら `basePath` を設定
6. [ ] 手動 URL 構築箇所に basePath を追加
7. [ ] Deploy して動作確認
