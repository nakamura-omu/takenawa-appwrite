"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  subscribeToRoom,
  deleteRoom,
  subscribeToPlayers,
  updateTableCount,
  updateEntryFields,
  updatePlayerTable,
  removePlayer,
  updateAdminName,
  updateEventName,
  updateEventDate,
} from "@/lib/room";
import { Room, Player, EntryField } from "@/types/room";
import { ensureAnonymousUser } from "@/lib/firebase";
import RoomInfoPanel from "@/components/admin/RoomInfoPanel";
import ScenarioPanel from "@/components/admin/ScenarioPanel";
import PlayersPanel from "@/components/admin/PlayersPanel";

export default function AdminRoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Record<string, Player> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // パスワード認証
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  // エントリーフィールド編集
  const [editingFields, setEditingFields] = useState(false);
  const [fieldsDraft, setFieldsDraft] = useState<EntryField[]>([]);

  // テーブル割り当て用
  const [assigningPlayer, setAssigningPlayer] = useState<string | null>(null);

  // sessionStorageチェック + UID認証
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(`admin_${roomId}`);
      if (stored === "1") {
        setAuthenticated(true);
      }
    }
  }, [roomId]);

  // creatorUid 一致で自動認証
  useEffect(() => {
    if (authenticated || !room) return;
    if (!room.config.creatorUid) return;
    (async () => {
      try {
        const uid = await ensureAnonymousUser();
        if (uid === room.config.creatorUid) {
          setAuthenticated(true);
          sessionStorage.setItem(`admin_${roomId}`, "1");
        }
      } catch { /* Auth未有効 */ }
    })();
  }, [room, authenticated, roomId]);

  // 匿名ログイン（セキュリティルールで auth != null が必要）
  useEffect(() => {
    ensureAnonymousUser().catch(() => {});
  }, []);

  // ルームの購読
  useEffect(() => {
    if (!roomId) return;

    const unsubRoom = subscribeToRoom(roomId, (data) => {
      if (data === null && loading) {
        setNotFound(true);
      }
      setRoom(data);
      setLoading(false);
    });
    const unsubPlayers = subscribeToPlayers(roomId, setPlayers);

    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomId, loading]);

  // パスワード検証
  const handlePasswordSubmit = () => {
    if (room && passwordInput === room.config.adminPassword) {
      setAuthenticated(true);
      setPasswordError(false);
      sessionStorage.setItem(`admin_${roomId}`, "1");
    } else {
      setPasswordError(true);
    }
  };

  // ルーム削除
  const handleDeleteRoom = async () => {
    if (!confirm("本当にルームを削除しますか？")) return;
    await deleteRoom(roomId);
    sessionStorage.removeItem(`admin_${roomId}`);
    window.location.href = "/";
  };

  // テーブル数保存
  const handleSaveTableCount = async (count: number) => {
    await updateTableCount(roomId, count);
  };

  // イベント名保存
  const handleSaveEventName = async (name: string) => {
    if (name) await updateEventName(roomId, name);
  };

  // イベント日時保存
  const handleSaveEventDate = async (date: string) => {
    if (date) await updateEventDate(roomId, date);
  };

  // エントリーフィールド編集開始
  const handleStartEditFields = () => {
    setFieldsDraft(room?.config.entryFields?.length ? room.config.entryFields : [{ id: "name", label: "名前", type: "text", required: true }]);
    setEditingFields(true);
  };

  // エントリーフィールド保存
  const handleSaveFields = async () => {
    await updateEntryFields(roomId, fieldsDraft);
    setEditingFields(false);
  };

  // フィールド追加
  const handleAddField = () => {
    setFieldsDraft([
      ...fieldsDraft,
      { id: `field_${Date.now()}`, label: "", type: "text", required: false },
    ]);
  };

  // フィールド削除
  const handleRemoveField = (index: number) => {
    setFieldsDraft(fieldsDraft.filter((_, i) => i !== index));
  };

  // フィールド更新
  const handleUpdateField = (index: number, updates: Partial<EntryField>) => {
    setFieldsDraft(fieldsDraft.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  };

  // フィールド並べ替え
  const handleMoveField = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= fieldsDraft.length) return;
    const newFields = [...fieldsDraft];
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    setFieldsDraft(newFields);
  };

  // テーブル割り当て
  const handleAssignTable = async (playerId: string, tableNumber: number) => {
    await updatePlayerTable(roomId, playerId, tableNumber);
    setAssigningPlayer(null);
  };

  // 管理者名保存
  const handleSaveAdminName = async (name: string) => {
    await updateAdminName(roomId, name);
  };

  // 参加者キック
  const handleKickPlayer = async (playerId: string, playerName: string) => {
    if (!confirm(`「${playerName}」をキックしますか？`)) return;
    await removePlayer(roomId, playerId);
    setAssigningPlayer(null);
  };

  // 受付開始前かどうか（currentStep が 0 なら受付前と判定）
  const isBeforeEntry = room?.state.currentStep === 0 && room?.state.phase === "waiting";

  // 管理画面タブ（進行中はルーム情報を隠して台本パネルを広く使える）
  const [adminTab, setAdminTab] = useState<"all" | "scenario">("all");

  // 参加者URL
  const participantUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/?room=${roomId}`
      : "";

  // テーブルごとの参加者（IDも保持）
  const playersByTable: Record<number, { id: string; player: Player }[]> = {};
  if (players) {
    Object.entries(players).forEach(([id, player]) => {
      const tNum = player.tableNumber || 0;
      if (!playersByTable[tNum]) {
        playersByTable[tNum] = [];
      }
      playersByTable[tNum].push({ id, player });
    });
  }

  // ローディング
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </main>
    );
  }

  // ルームが見つからない
  if (notFound || !room) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8">
        <h1 className="text-2xl font-bold mb-4">ルームが見つかりません</h1>
        <p className="text-gray-400 mb-6">
          ルームID「{roomId}」は存在しないか、削除されています。
        </p>
        <a
          href="/"
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition"
        >
          トップへ戻る
        </a>
      </main>
    );
  }

  // パスワード未認証
  if (!authenticated) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="bg-gray-900 rounded-lg p-6 w-full max-w-sm">
          <h1 className="text-xl font-bold mb-2">管理者ログイン</h1>
          <p className="text-sm text-gray-400 mb-4">
            「{room.config.eventName}」の管理画面にアクセスするにはパスワードを入力してください。
          </p>
          <input
            type="text"
            value={passwordInput}
            onChange={(e) => {
              setPasswordInput(e.target.value);
              setPasswordError(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
            placeholder="あいことばを入力"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500 mb-3"
          />
          {passwordError && (
            <p className="text-red-400 text-sm mb-3">パスワードが違います</p>
          )}
          <button
            onClick={handlePasswordSubmit}
            disabled={!passwordInput}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-semibold transition"
          >
            ログイン
          </button>
          <a
            href="/"
            className="block text-center text-sm text-gray-500 hover:text-gray-300 mt-4"
          >
            ← トップへ戻る
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <header className="mb-6 flex items-center gap-4">
        <a href="/" className="text-gray-400 hover:text-white transition">
          ← トップ
        </a>
        <div>
          <h1 className="text-2xl font-bold">{room.config.eventName}</h1>
          <p className="text-gray-400 text-sm">{room.config.eventDate}</p>
        </div>
        {/* 表示切替タブ */}
        <div className="ml-auto flex bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setAdminTab("all")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition ${adminTab === "all" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
          >
            全パネル
          </button>
          <button
            onClick={() => setAdminTab("scenario")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition ${adminTab === "scenario" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
          >
            進行集中
          </button>
        </div>
      </header>

      {adminTab === "all" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          {/* 左: ルーム情報・QRコード */}
          <div className="lg:col-span-3">
            <RoomInfoPanel
              roomId={roomId}
              room={room}
              players={players}
              participantUrl={participantUrl}
              isBeforeEntry={isBeforeEntry}
              onSaveEventName={handleSaveEventName}
              onSaveEventDate={handleSaveEventDate}
              onSaveAdminName={handleSaveAdminName}
              onSaveTableCount={handleSaveTableCount}
              editingFields={editingFields}
              setEditingFields={setEditingFields}
              fieldsDraft={fieldsDraft}
              onStartEditFields={handleStartEditFields}
              onSaveFields={handleSaveFields}
              onAddField={handleAddField}
              onRemoveField={handleRemoveField}
              onUpdateField={handleUpdateField}
              onMoveField={handleMoveField}
              onDeleteRoom={handleDeleteRoom}
            />
          </div>

          {/* 中央: 台本・進行 */}
          <div className="lg:col-span-6">
            <ScenarioPanel
              roomId={roomId}
              room={room}
              players={players}
            />
          </div>

          {/* 右: 参加者モニター & テーブル割り当て */}
          <div className="lg:col-span-3">
            <PlayersPanel
              room={room}
              players={players}
              playersByTable={playersByTable}
              assigningPlayer={assigningPlayer}
              setAssigningPlayer={setAssigningPlayer}
              onAssignTable={handleAssignTable}
              onKickPlayer={handleKickPlayer}
            />
          </div>
        </div>
      ) : (
        /* 進行集中モード: 台本パネルをワイド + 参加者をサイドに */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          <div className="lg:col-span-8">
            <ScenarioPanel
              roomId={roomId}
              room={room}
              players={players}
            />
          </div>
          <div className="lg:col-span-4">
            <PlayersPanel
              room={room}
              players={players}
              playersByTable={playersByTable}
              assigningPlayer={assigningPlayer}
              setAssigningPlayer={setAssigningPlayer}
              onAssignTable={handleAssignTable}
              onKickPlayer={handleKickPlayer}
            />
          </div>
        </div>
      )}
    </main>
  );
}
