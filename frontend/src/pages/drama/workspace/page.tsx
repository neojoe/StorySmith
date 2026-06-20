import { useNavigate } from "react-router-dom";
import { ArrowLeft, Film, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DramaWorkspacePage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-900/30">
        <Film className="h-7 w-7 text-primary-500" />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">漫剧工作台</h1>
          <span className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
            <Lock className="h-3 w-3" />
            开源版暂不开放
          </span>
        </div>
        <p className="text-sm text-neutral-500">此功能在开源版中暂未开放，敬请期待后续版本。</p>
      </div>
      <Button variant="outline" onClick={() => navigate("/drama")} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        返回漫剧列表
      </Button>
    </div>
  );
}
