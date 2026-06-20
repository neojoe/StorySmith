import { BookOpen, FileText, PenLine, Bot, ArrowRight, Sparkles, Lightbulb } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-novel";
import { useI18n } from "@/i18n";

const quickActionIcons = [Bot, Lightbulb, PenLine];
const quickActionColors = [
  { color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/20", border: "border-violet-200 dark:border-violet-800", to: "/novel/agent/new" },
  { color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-900/20",   border: "border-amber-200 dark:border-amber-800",   to: "/novel/ideas"     },
  { color: "text-primary-600 dark:text-primary-400", bg: "bg-primary-50 dark:bg-primary-900/20", border: "border-primary-200 dark:border-primary-800", to: "/novel"       },
];

export function DashboardPage() {
  const { t } = useI18n();
  const d = t.dashboard;
  const { data: projects } = useProjects();

  const totalProjects = projects?.length ?? 0;
  const publishedCount = projects?.filter((p) => p.status === "published").length ?? 0;
  const draftCount = projects?.filter((p) => p.status !== "published").length ?? 0;
  const totalWords = projects?.reduce((acc, p) => acc + (p.total_word_count ?? 0), 0) ?? 0;
  const wordDisplay = totalWords > 10000
    ? `${(totalWords / 10000).toFixed(1)}万`
    : String(totalWords);

  const stats = [
    { label: d.statProjects,  value: totalProjects,  icon: BookOpen,  suffix: d.statUnit },
    { label: d.statPublished, value: publishedCount, icon: FileText,  suffix: d.statUnit },
    { label: d.statDraft,     value: draftCount,     icon: PenLine,   suffix: d.statUnit },
    { label: d.statWords,     value: wordDisplay,    icon: Sparkles,  suffix: ""         },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{d.title}</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{d.subtitle}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, suffix }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {label}
                  </span>
                  <span className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                    {value}
                    {suffix && (
                      <span className="ml-0.5 text-sm font-normal text-neutral-500">{suffix}</span>
                    )}
                  </span>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-700">
                  <Icon className="h-5 w-5 text-neutral-600 dark:text-neutral-300" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          {d.quickStartTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {d.quickActions.map((action, i) => {
            const Icon = quickActionIcons[i];
            const { color, bg, border, to } = quickActionColors[i];
            return (
              <Link key={to} to={to}>
                <div
                  className={`group flex h-full cursor-pointer items-start gap-3 rounded-2xl border ${border} ${bg} p-4 transition-all hover:shadow-sm`}
                >
                  <div className="mt-0.5 shrink-0">
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${color}`}>{action.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                      {action.desc}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 dark:text-neutral-600" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            {d.guideTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ol className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {d.guideSteps.map(({ title, desc }, i) => (
              <li key={i} className="flex items-center gap-4 px-6 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{title}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-neutral-100 px-6 py-3 dark:border-neutral-700">
            <Link to="/novel">
              <Button size="sm" variant="outline" className="gap-2">
                <BookOpen className="h-3.5 w-3.5" />
                {d.enterFactory}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
