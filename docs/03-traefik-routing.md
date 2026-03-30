# URL ルーティング設定

## 仕組み

全てのアプリは同じドメイン `pocketbase.ciist.omu.ac.jp` 配下で、
**パス (path)** によって振り分けられます。

```
https://pocketbase.ciist.omu.ac.jp/<パス>  →  あなたのアプリ
```

これを実現しているのが **Traefik** というリバースプロキシです。
Appwrite に同梱されており、Docker ラベルでルーティングルールを自動検出します。

---

## 設定方法

Coolify でアプリをデプロイする際に、**Docker Labels** を以下のように設定します。

### テンプレート

```
traefik.enable=true
traefik.constraint-label-stack=appwrite
traefik.http.routers.<アプリ名>.rule=PathPrefix(`/<パス>`)
traefik.http.routers.<アプリ名>.entrypoints=appwrite_web
traefik.http.services.<アプリ名>.loadbalancer.server.port=<ポート>
```

### 各行の意味

| ラベル | 説明 |
|---|---|
| `traefik.enable=true` | Traefik にこのコンテナを認識させる |
| `traefik.constraint-label-stack=appwrite` | Appwrite の Traefik に検出される条件 |
| `traefik.http.routers.<名前>.rule=...` | どの URL パスでこのアプリに転送するか |
| `traefik.http.routers.<名前>.entrypoints=...` | Traefik のエントリポイント（固定） |
| `traefik.http.services.<名前>.loadbalancer.server.port=...` | アプリが Listen しているポート |

> `<アプリ名>` は Traefik 内でユニークな識別子。他のアプリと被らなければ何でも OK。

---

## 設定例

### Next.js アプリ (`/myapp`)

```
traefik.enable=true
traefik.constraint-label-stack=appwrite
traefik.http.routers.myapp.rule=PathPrefix(`/myapp`)
traefik.http.routers.myapp.entrypoints=appwrite_web
traefik.http.services.myapp.loadbalancer.server.port=3000
```

```typescript
// next.config.ts
const nextConfig = { basePath: "/myapp" };
```

### Vite + React アプリ (`/dashboard`)

```
traefik.enable=true
traefik.constraint-label-stack=appwrite
traefik.http.routers.dashboard.rule=PathPrefix(`/dashboard`)
traefik.http.routers.dashboard.entrypoints=appwrite_web
traefik.http.services.dashboard.loadbalancer.server.port=5173
```

```typescript
// vite.config.ts
export default defineConfig({ base: '/dashboard/' });
```

### Flask API (`/api/myservice`)

```
traefik.enable=true
traefik.constraint-label-stack=appwrite
traefik.http.routers.myservice.rule=PathPrefix(`/api/myservice`)
traefik.http.routers.myservice.entrypoints=appwrite_web
traefik.http.services.myservice.loadbalancer.server.port=5000
```

---

## パス名のルール

- **他のアプリと被らないこと**（一覧は管理者に確認）
- **Appwrite の予約パス** (`/v1`, `/console`) は使えません
- 短くてわかりやすい名前を推奨

### 現在使用中のパス

| パス | アプリ |
|---|---|
| `/v1` | Appwrite API（変更不可） |
| `/console` | Appwrite 管理コンソール（変更不可） |
| `/takenawa` | Takenawa（宴会進行補助） |

---

## Coolify の既存ラベルについて

Coolify はデプロイ時に独自の Traefik ラベル（`sslip.io` ドメインを使うもの）を自動生成します。
**これは使いません。** Coolify の Docker Labels 設定画面で全て削除し、上記のテンプレートに置き換えてください。

---

## 動作の流れ

```
1. Coolify がコンテナをデプロイ
       ↓
2. コンテナに Docker ラベルが付与される
       ↓
3. Traefik が自動検出（constraint-label-stack=appwrite を持つコンテナ）
       ↓
4. PathPrefix ルールに基づいてリクエストを転送
       ↓
5. https://pocketbase.ciist.omu.ac.jp/<パス> でアクセス可能に
```

再デプロイしてもコンテナが新しくなるだけで、ラベルは引き継がれるため **手動作業は不要** です。
