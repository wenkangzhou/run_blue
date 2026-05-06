"use client";

import { useTranslation } from "react-i18next";
import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="text-center space-y-4">
        <WifiOff size={48} className="mx-auto text-zinc-400" />
        <h1 className="font-pixel text-2xl font-bold">
          {t("offline.title", "当前处于离线状态")}
        </h1>
        <p className="text-zinc-500 max-w-sm mx-auto">
          {t(
            "offline.description",
            "你已缓存的数据仍可浏览。连接网络后可同步最新跑步记录。"
          )}
        </p>
        <div className="pt-4">
          <a
            href="/"
            className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-mono hover:bg-blue-700 transition-colors"
          >
            {t("offline.goHome", "返回首页")}
          </a>
        </div>
      </div>
    </div>
  );
}
