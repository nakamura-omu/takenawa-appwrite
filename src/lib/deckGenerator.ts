import { GameType } from "@/types/room";

// Fisher-Yates シャッフル
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// くるっくりんデッキ生成（80枚）
// 1,2,14,15→3枚 / 3,13→4枚 / 4,12→5枚 / 5,11→6枚 / 6,10→7枚 / 7,8,9→8枚
function generateKrukkurinDeck(): number[] {
  const counts: Record<number, number> = {
    1: 3, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8,
    8: 8, 9: 8, 10: 7, 11: 6, 12: 5, 13: 4, 14: 3, 15: 3,
  };
  const deck: number[] = [];
  for (const [num, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) {
      deck.push(Number(num));
    }
  }
  return shuffle(deck);
}

// メタストリームスデッキ生成（99枚、各1枚ずつ）
function generateMetaStreamsDeck(): number[] {
  const deck: number[] = [];
  for (let i = 1; i <= 99; i++) {
    deck.push(i);
  }
  return shuffle(deck);
}

// ゲームタイプに応じたデッキ生成
export function generateDeck(gameType: GameType): number[] {
  switch (gameType) {
    case "krukkurin":
      return generateKrukkurinDeck();
    case "meta_streams":
      return generateMetaStreamsDeck();
    default:
      return [];
  }
}

// ボードの行構成を取得
export function getBoardLayout(gameType: GameType): { rows: number[]; labels: string[]; colors: string[] } {
  switch (gameType) {
    case "krukkurin":
      return {
        rows: [5, 8, 12],
        labels: ["赤", "青", "黄"],
        colors: ["bg-red-900/40 border-red-700/50", "bg-blue-900/40 border-blue-700/50", "bg-yellow-900/40 border-yellow-700/50"],
      };
    case "meta_streams":
      return {
        rows: [18],
        labels: [""],
        colors: ["bg-indigo-900/40 border-indigo-700/50"],
      };
    default:
      return { rows: [], labels: [], colors: [] };
  }
}

// 空ボードを生成
export function createEmptyBoard(gameType: GameType): (number | null)[][] {
  const layout = getBoardLayout(gameType);
  return layout.rows.map((size) => Array(size).fill(null));
}
