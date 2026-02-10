"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <p className="text-gray-400">トップページへ移動中...</p>
    </main>
  );
}
