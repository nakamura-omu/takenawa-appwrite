# CIIST 開発プラットフォーム 概要

## このプラットフォームについて

CIIST が学内開発者向けに提供するセルフホスト型の開発基盤です。
Firebase や Vercel の代替として、**バックエンド (Appwrite)** と **フロントホスティング (Coolify)** を利用できます。

外部サービスへの依存なし・学内ネットワーク内で完結します。

---

## 何ができるか

| やりたいこと | 使うサービス | Firebase/Vercel での相当機能 |
|---|---|---|
| ユーザー認証 | Appwrite Auth | Firebase Authentication |
| データベース | Appwrite Databases | Firestore / Realtime Database |
| リアルタイム同期 | Appwrite Realtime | Firebase Realtime Database |
| ファイル保存 | Appwrite Storage | Firebase Storage |
| サーバーレス関数 | Appwrite Functions | Cloud Functions |
| フロントデプロイ | Coolify | Vercel / Netlify |
| OAuth 認証 | Appwrite + Azure AD | Firebase + Google Auth |

---

## システム構成図

```
                         ┌──────────────────────────────────────┐
                         │      cii-st-namba サーバー            │
                         │      Ubuntu 24.04 / 12GB RAM         │
┌──────────┐             │                                      │
│ ユーザー  │             │  ┌──────────────────────────────┐    │
│ ブラウザ  │──HTTPS──▶   │  │  Traefik (:8000)             │    │
│          │             │  │  リバースプロキシ              │    │
└──────────┘             │  │                              │    │
                         │  │  /v1/*       → Appwrite API  │    │
   ※ SSL は学内 LB       │  │  /console/* → Appwrite GUI   │    │
     で終端              │  │  /yourapp/* → あなたのアプリ   │    │
                         │  │  /other/*   → 別のアプリ      │    │
                         │  └──────────────────────────────┘    │
                         │        │             │               │
                         │        ▼             ▼               │
                         │  ┌──────────┐  ┌─────────────┐      │
                         │  │ Appwrite │  │ Coolify が   │      │
                         │  │ バックエンド│  │ 管理する     │      │
                         │  │          │  │ アプリ群     │      │
                         │  └──────────┘  └─────────────┘      │
                         │                                      │
                         │  ┌───────────────────────┐          │
                         │  │ Coolify (:8080)        │          │
                         │  │ デプロイ管理 UI         │          │
                         │  └───────────────────────┘          │
                         └──────────────────────────────────────┘
```

---

## アクセス情報

| サービス | URL | 用途 |
|---|---|---|
| Appwrite コンソール | `https://pocketbase.ciist.omu.ac.jp/console` | DB・認証の管理 |
| Appwrite API | `https://pocketbase.ciist.omu.ac.jp/v1` | アプリからの API コール |
| Coolify | `http://10.159.42.16:8080` | デプロイ管理（学内のみ） |
| あなたのアプリ | `https://pocketbase.ciist.omu.ac.jp/<アプリ名>` | 公開 URL |

---

## 開発の流れ

```
1. Appwrite コンソールでプロジェクト作成
       ↓
2. DB スキーマ定義 / 認証設定
       ↓
3. ローカルでアプリ開発（Appwrite SDK 使用）
       ↓
4. GitHub にリポジトリ作成・push
       ↓
5. Coolify でリポジトリ接続 → Deploy
       ↓
6. https://pocketbase.ciist.omu.ac.jp/<アプリ名> で公開！
```

---

## ドキュメント一覧

| ドキュメント | 内容 |
|---|---|
| [01-appwrite-guide.md](./01-appwrite-guide.md) | Appwrite の使い方（認証・DB・リアルタイム・SDK） |
| [02-coolify-deploy.md](./02-coolify-deploy.md) | Coolify でアプリをデプロイする手順 |
| [03-traefik-routing.md](./03-traefik-routing.md) | URL ルーティングの設定方法 |
| [04-example-takenawa.md](./04-example-takenawa.md) | 実例: Takenawa (Firebase → Appwrite 移植) |

---

## 対応 SDK

Appwrite は多数の SDK を提供しています:

| 言語/フレームワーク | パッケージ |
|---|---|
| **JavaScript / TypeScript** | `npm install appwrite` |
| **React / Next.js / Vue** | `npm install appwrite` (同じ SDK) |
| **Flutter** | `pub add appwrite` |
| **Swift (iOS)** | `appwrite/sdk-for-swift` |
| **Kotlin (Android)** | `io.appwrite:sdk-for-kotlin` |
| **Python** | `pip install appwrite` |

詳細: [Appwrite 公式ドキュメント](https://appwrite.io/docs)
