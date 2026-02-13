"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createRoom, getRoomsByCreator } from "@/lib/room";
import { ensureAnonymousUser } from "@/lib/firebase";
import { Room } from "@/types/room";
import { EntryForm } from "@/components/player/EntryForm";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomParam = searchParams.get("room");

  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState("");

  // マイルーム
  const [myRooms, setMyRooms] = useState<{ id: string; room: Room }[]>([]);
  const [myRoomsLoading, setMyRoomsLoading] = useState(true);

  // 匿名ログイン + マイルーム取得
  useEffect(() => {
    if (roomParam) return; // エントリーフォーム表示時はスキップ
    (async () => {
      try {
        const uid = await ensureAnonymousUser();
        const rooms = await getRoomsByCreator(uid);
        setMyRooms(rooms);
      } catch {
        // Auth未有効でもエラーにしない
      } finally {
        setMyRoomsLoading(false);
      }
    })();
  }, [roomParam]);

  // ?room=XXX がある場合はエントリーフォームを表示
  if (roomParam) {
    return <EntryForm roomId={roomParam} />;
  }

  const handleCreateRoom = async () => {
    if (!eventName.trim() || !eventDate || !adminPassword) return;
    setIsCreating(true);
    try {
      let uid: string | undefined;
      try { uid = await ensureAnonymousUser(); } catch { /* Auth未有効 */ }
      const id = await createRoom(eventName.trim(), eventDate, adminPassword, uid);
      // パスワード認証済みとしてsessionStorageに保存
      sessionStorage.setItem(`admin_${id}`, "1");
      router.push(`/admin/${id}`);
    } catch (error) {
      console.error("ルーム作成エラー:", error);
      alert("ルーム作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = () => {
    const id = joinRoomId.trim().toUpperCase();
    if (id) {
      router.push(`/?room=${id}`);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* ヒーロー */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-2">Takenawa</h1>
        <p className="text-gray-400">宴会進行補助サービス</p>
      </div>

      <div className="w-full max-w-md space-y-8">
        {/* マイルーム */}
        {!myRoomsLoading && myRooms.length > 0 && (
          <section className="bg-gray-900 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">マイルーム</h2>
            <p className="text-sm text-gray-400 mb-3">
              このブラウザで作成したルーム
            </p>
            <div className="space-y-2">
              {myRooms.map(({ id, room: r }) => (
                <div
                  key={id}
                  className="flex items-center justify-between bg-gray-800 rounded-lg p-3"
                >
                  <div>
                    <p className="font-medium text-sm">{r.config.eventName}</p>
                    <p className="text-xs text-gray-500">
                      {r.config.eventDate} / {id}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      sessionStorage.setItem(`admin_${id}`, "1");
                      router.push(`/admin/${id}`);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-semibold transition"
                  >
                    管理画面
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 宴会をつくる */}
        <section className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">宴会をつくる</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                イベント名
              </label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="例: 2026年 新年会"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                予定日
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                管理者のあいことば
              </label>
              <input
                type="text"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="例: さくら"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={isCreating || !eventName.trim() || !eventDate || !adminPassword}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-semibold transition"
            >
              {isCreating ? "作成中..." : "宴会をつくる"}
            </button>
          </div>
        </section>

        {/* 既存ルームに入る */}
        <section className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">ルームに入る</h2>
          <p className="text-sm text-gray-400 mb-4">
            QRコードを読み取るか、ルームIDを入力してください。
          </p>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
              placeholder="ルームID（例: AB12345）"
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              maxLength={10}
            />
            <button
              onClick={handleJoinRoom}
              disabled={!joinRoomId.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-semibold transition"
            >
              参加
            </button>
          </div>
          <button
            onClick={() => {
              const id = joinRoomId.trim().toUpperCase();
              if (id) router.push(`/admin/${id}`);
            }}
            disabled={!joinRoomId.trim()}
            className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 transition mt-1"
          >
            管理画面に入る →
          </button>
        </section>

      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}
