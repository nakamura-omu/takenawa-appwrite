import { AdminMessage } from "@/types/room";

// 管理者メッセージカード
export function MessageCard({ message, senderName }: { message: AdminMessage; senderName?: string }) {
  return (
    <div className="relative pl-6 pb-6">
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
      <div className="absolute left-0.5 top-1.5 w-3 h-3 rounded-full border-2 border-gray-950 bg-yellow-500" />
      <div className="bg-yellow-900/20 rounded-lg p-4 border border-yellow-700/50">
        <p className="text-xs text-yellow-400 mb-1">{senderName || "主催より"}</p>
        <p className="text-sm font-medium text-yellow-200 whitespace-pre-wrap">{message.text}</p>
      </div>
    </div>
  );
}
