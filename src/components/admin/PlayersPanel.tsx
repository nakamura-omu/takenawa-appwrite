"use client";

import { Room, Player } from "@/types/room";

export interface PlayersPanelProps {
  room: Room;
  players: Record<string, Player> | null;
  playersByTable: Record<number, { id: string; player: Player }[]>;
  assigningPlayer: string | null;
  setAssigningPlayer: (v: string | null) => void;
  onAssignTable: (playerId: string, tableNumber: number) => void;
  onKickPlayer: (playerId: string, playerName: string) => void;
}

export default function PlayersPanel({
  room,
  players,
  playersByTable,
  assigningPlayer,
  setAssigningPlayer,
  onAssignTable,
  onKickPlayer,
}: PlayersPanelProps) {
  return (
    <section className="bg-gray-900 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">
        参加者・テーブル割り当て
      </h2>

      {!players || Object.keys(players).length === 0 ? (
        <p className="text-gray-500 text-sm">参加者待ち...</p>
      ) : (
        <div className="space-y-4">
          {/* 未割当エリア（新規参加者） */}
          {(playersByTable[0]?.length ?? 0) > 0 && (
            <div>
              <p className="text-sm text-yellow-400 mb-1 font-semibold">
                未割当（{playersByTable[0].length}人）
              </p>
              <div className="space-y-1">
                {playersByTable[0].map(({ id, player }) => (
                  <div key={id} className="relative">
                    <div
                      onClick={() => setAssigningPlayer(assigningPlayer === id ? null : id)}
                      className="px-2 py-1 rounded text-sm bg-yellow-900/30 text-yellow-300 cursor-pointer hover:bg-yellow-900/50 transition flex items-center justify-between"
                    >
                      <span>{player.name}</span>
                      <span className="text-xs text-yellow-500">割当 ▾</span>
                    </div>
                    {assigningPlayer === id && (
                      <div className="mt-1 bg-gray-800 border border-gray-600 rounded p-2 flex flex-wrap gap-1">
                        {Array.from({ length: room.config.tableCount || 0 }, (_, i) => i + 1).map((tNum) => (
                          <button
                            key={tNum}
                            onClick={() => onAssignTable(id, tNum)}
                            className="px-2 py-1 bg-gray-700 hover:bg-blue-600 rounded text-xs transition"
                          >
                            T{tNum}
                          </button>
                        ))}
                        <button
                          onClick={() => onAssignTable(id, -1)}
                          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs transition"
                        >
                          テーブル外
                        </button>
                        <button
                          onClick={() => onKickPlayer(id, player.name)}
                          className="px-2 py-1 bg-red-900 hover:bg-red-700 rounded text-xs transition text-red-300"
                        >
                          キック
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* テーブル別エリア */}
          {Array.from(
            { length: room.config.tableCount || 0 },
            (_, i) => i + 1
          ).map((tableNum) => (
            <div key={tableNum}>
              <p className="text-sm text-gray-400 mb-1">
                テーブル {tableNum}
                <span className="text-xs text-gray-600 ml-1">
                  ({playersByTable[tableNum]?.length || 0}人)
                </span>
              </p>
              <div className="space-y-1">
                {playersByTable[tableNum]?.map(({ id, player }) => (
                  <div key={id} className="relative">
                    <div
                      onClick={() => setAssigningPlayer(assigningPlayer === id ? null : id)}
                      className={`px-2 py-1 rounded text-sm cursor-pointer transition flex items-center justify-between ${
                        player.connected
                          ? "bg-green-900/30 text-green-300 hover:bg-green-900/50"
                          : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                      }`}
                    >
                      <span>{player.name}</span>
                      <span className="text-xs text-gray-500">移動 ▾</span>
                    </div>
                    {assigningPlayer === id && (
                      <div className="mt-1 bg-gray-800 border border-gray-600 rounded p-2 flex flex-wrap gap-1">
                        {Array.from({ length: room.config.tableCount || 0 }, (_, i) => i + 1)
                          .filter((t) => t !== tableNum)
                          .map((tNum) => (
                            <button
                              key={tNum}
                              onClick={() => onAssignTable(id, tNum)}
                              className="px-2 py-1 bg-gray-700 hover:bg-blue-600 rounded text-xs transition"
                            >
                              T{tNum}
                            </button>
                          ))}
                        <button
                          onClick={() => onAssignTable(id, -1)}
                          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs transition"
                        >
                          テーブル外
                        </button>
                        <button
                          onClick={() => onKickPlayer(id, player.name)}
                          className="px-2 py-1 bg-red-900 hover:bg-red-700 rounded text-xs transition text-red-300"
                        >
                          キック
                        </button>
                      </div>
                    )}
                  </div>
                )) || <p className="text-xs text-gray-600">（空席）</p>}
              </div>
            </div>
          ))}

          {/* テーブル外エリア（プール） */}
          {(playersByTable[-1]?.length ?? 0) > 0 && (
            <div>
              <p className="text-sm text-gray-500 mb-1 font-semibold">
                テーブル外（{playersByTable[-1].length}人）
              </p>
              <div className="space-y-1">
                {playersByTable[-1].map(({ id, player }) => (
                  <div key={id} className="relative">
                    <div
                      onClick={() => setAssigningPlayer(assigningPlayer === id ? null : id)}
                      className="px-2 py-1 rounded text-sm bg-gray-800 text-gray-500 cursor-pointer hover:bg-gray-700 transition flex items-center justify-between"
                    >
                      <span>{player.name}</span>
                      <span className="text-xs text-gray-600">移動 ▾</span>
                    </div>
                    {assigningPlayer === id && (
                      <div className="mt-1 bg-gray-800 border border-gray-600 rounded p-2 flex flex-wrap gap-1">
                        <button
                          onClick={() => onAssignTable(id, 0)}
                          className="px-2 py-1 bg-yellow-800 hover:bg-yellow-700 rounded text-xs transition"
                        >
                          未割当
                        </button>
                        {Array.from({ length: room.config.tableCount || 0 }, (_, i) => i + 1).map((tNum) => (
                          <button
                            key={tNum}
                            onClick={() => onAssignTable(id, tNum)}
                            className="px-2 py-1 bg-gray-700 hover:bg-blue-600 rounded text-xs transition"
                          >
                            T{tNum}
                          </button>
                        ))}
                        <button
                          onClick={() => onKickPlayer(id, player.name)}
                          className="px-2 py-1 bg-red-900 hover:bg-red-700 rounded text-xs transition text-red-300"
                        >
                          キック
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
