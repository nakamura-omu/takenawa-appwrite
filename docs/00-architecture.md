# Takenawa (Appwrite版) アーキテクチャ概要

## このドキュメントについて

Takenawa は宴会・懇親会の進行を補助する Web アプリです。
元々は Firebase をバックエンドとしていましたが、学内セルフホスト環境で完結するよう **Appwrite** に移植しました。

このドキュメントでは、Appwrite 版の全体構成を説明します。

---

## システム構成図

```
                        ┌─────────────────────────────────────┐
                        │     cii-st-namba (10.159.42.16)     │
                        │         Ubuntu 24.04 LTS            │
                        │     4 vCPU / 12GB RAM / 97GB        │
┌──────────┐            │                                     │
│ 参加者   │            │  ┌─────────────────────────────┐    │
│ スマホ   │──HTTPS──▶  │  │  Appwrite Traefik (:8000)   │    │
│          │            │  │  リバースプロキシ            │    │
└──────────┘            │  │                             │    │
                        │  │  /v1/*      → Appwrite API  │    │
┌──────────┐            │  │  /console/* → Appwrite GUI  │    │
│ 管理者   │──HTTPS──▶  │  │  /takenawa  → Next.js App   │    │
│ PC       │            │  │             (Docker ラベル   │    │
└──────────┘            │  │              で自動検出)     │    │
                        │  └─────────────────────────────┘    │
   ※ SSL は学内 LB      │        │              │             │
     で終端             │        ▼              ▼             │
                        │  ┌──────────┐  ┌──────────────┐    │
                        │  │ Appwrite │  │   Takenawa   │    │
                        │  │ コンテナ群│  │  (Coolify     │    │
                        │  │ (27個)   │  │   管理)      │    │
                        │  └──────────┘  └──────────────┘    │
                        │                                     │
                        │  ┌──────────────────────────┐      │
                        │  │ Coolify (:8080)           │      │
                        │  │ セルフホスト PaaS          │      │
                        │  │ デプロイ管理 UI            │      │
                        │  └──────────────────────────┘      │
                        └─────────────────────────────────────┘
```

---

## 技術スタック

| レイヤー | 技術 | 役割 |
|---|---|---|
| **フロントエンド** | Next.js 15 (App Router) | UI / クライアントサイドレンダリング |
| **スタイリング** | Tailwind CSS | デザイン |
| **アニメーション** | GSAP | ゲーム演出 |
| **バックエンド (BaaS)** | Appwrite v1.8.1 | DB / 認証 / リアルタイム |
| **フロントホスティング** | Coolify | Git 連携デプロイ |
| **リバースプロキシ** | Traefik (Appwrite 同梱) | パスベースルーティング |
| **コンテナ基盤** | Docker / Docker Compose | 全サービスのコンテナ化 |

---

## データフロー

### 認証
```
参加者 → Appwrite Anonymous Session → UID 取得
```
- ユーザー登録不要。匿名セッションで即参加
- UID は「マイルーム」機能でルーム作成者の識別に使用

### リアルタイム同期
```
管理者操作 → Appwrite DB 更新 → WebSocket → 全参加者に即時反映
参加者回答 → Appwrite DB 更新 → WebSocket → 管理者画面に即時反映
```

### データモデル (3 コレクション)

| コレクション | 用途 | ドキュメント数 |
|---|---|---|
| `rooms` | ルーム設定・状態・ゲーム進行 | 1 / ルーム |
| `players` | 参加者情報 | 1 / 参加者 |
| `answers` | ゲーム回答 | 1 / 回答 |

**なぜ 3 コレクション？**
- `rooms`: 管理者のみ書き込み → 競合なし
- `players`: 50人が同時に参加 → 別コレクションで競合回避
- `answers`: 50人が同時に回答 → 別コレクションで競合回避

---

## URL 構成

| URL | 用途 |
|---|---|
| `https://pocketbase.ciist.omu.ac.jp/takenawa` | トップページ / 参加者入場 |
| `https://pocketbase.ciist.omu.ac.jp/takenawa?room=XXXX` | ルーム参加 (QRコード) |
| `https://pocketbase.ciist.omu.ac.jp/takenawa/admin/XXXX` | 管理者画面 |
| `https://pocketbase.ciist.omu.ac.jp/console` | Appwrite 管理コンソール |
| `http://10.159.42.16:8080` | Coolify ダッシュボード (学内) |

---

## メモリ使用量

| サービス | 推定メモリ |
|---|---|
| Appwrite (全コンテナ) | ~2.5-3GB |
| Coolify (本体 + Takenawa 等の管理対象アプリ) | ~1.5-2GB |
| OS + バッファ | ~2GB |
| **残り (12GB中)** | **~5-6GB** |

---

## 関連ドキュメント

- [01-appwrite-setup.md](./01-appwrite-setup.md) — Appwrite プロジェクト・DB セットアップ
- [02-migration-guide.md](./02-migration-guide.md) — Firebase → Appwrite 移植の技術詳細
- [03-coolify-deploy.md](./03-coolify-deploy.md) — Coolify インストール・デプロイ手順
- [04-traefik-routing.md](./04-traefik-routing.md) — Traefik パスベースルーティング設定
