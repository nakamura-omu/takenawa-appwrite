"use client";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-8">宴会ゲーム</h1>
      <p className="text-gray-400 mb-4">参加者エントリー画面（実装予定）</p>
      <a
        href="/admin"
        className="text-blue-400 hover:text-blue-300 underline"
      >
        管理者画面へ →
      </a>
    </main>
  );
}
