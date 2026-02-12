#!/bin/bash
# Next.js dev server の再起動スクリプト
# 使い方: npm run restart  or  bash dev.sh

PORT=4000

echo "=== ポート ${PORT} のプロセスを確認中..."

# Windows: netstat でポートを使っているPIDを取得
PID=$(netstat -ano 2>/dev/null | grep ":${PORT}" | grep "LISTENING" | awk '{print $5}' | head -1)

if [ -n "$PID" ] && [ "$PID" != "0" ]; then
  echo "=== PID ${PID} を停止します..."
  cmd.exe /c "taskkill /PID ${PID} /F" 2>/dev/null
  sleep 1
else
  echo "=== ポート ${PORT} は空いています"
fi

echo "=== .next キャッシュを削除中..."
rm -rf .next

echo "=== dev server を起動します (port ${PORT})..."
npx next dev -p $PORT
