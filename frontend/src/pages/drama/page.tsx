import { Film, Lock, BookOpen, ArrowLeft, Clapperboard, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

const featureIcons = [Film, Clapperboard, Sparkles];

export function DramaPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const d = t.drama;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-900/30">
        <Film className="h-8 w-8 text-primary-500 dark:text-primary-400" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{d.title}</h1>
          <span className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
            <Lock className="h-3 w-3" />
            {t.common.openSourceOnly}
          </span>
        </div>
        <p className="max-w-md text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          {d.description}
        </p>
      </div>

      <div className="grid max-w-xl gap-3 text-left sm:grid-cols-3">
        {d.features.map(({ title, desc }, i) => {
          const Icon = featureIcons[i];
          return (
            <div
              key={title}
              className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                <Icon className="h-4 w-4 text-primary-500" />
                {title}
              </div>
              <p className="mt-1 text-xs leading-5 text-neutral-400">{desc}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button onClick={() => navigate("/novel")} className="gap-2">
          <BookOpen className="h-4 w-4" />
          {d.goNovel}
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 text-neutral-500">
          <ArrowLeft className="h-4 w-4" />
          {t.common.back}
        </Button>
      </div>

      <p className="max-w-sm text-xs text-neutral-400">{d.note}</p>
    </div>
  );
}
