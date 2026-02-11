// テーブル番号表示（共通パーツ）
export function TableBadge({ tableNum }: { tableNum: number }) {
  if (tableNum > 0) {
    return (
      <div className="bg-blue-900/40 border border-blue-500 rounded-lg p-3 text-center">
        <p className="text-xs text-blue-300 mb-1">あなたのテーブル</p>
        <p className="text-3xl font-bold text-blue-400">{tableNum}</p>
      </div>
    );
  }
  if (tableNum === -1) {
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-center">
        <p className="text-xs text-gray-400 mb-1">テーブル</p>
        <p className="text-sm text-gray-500">テーブル外</p>
      </div>
    );
  }
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-400 mb-1">テーブル番号</p>
      <p className="text-sm text-yellow-400">割り当て待ち...</p>
    </div>
  );
}
