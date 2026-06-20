import {
  ArrowRight,
  BookOpen,
  Bot,
  Lightbulb,
  Sparkles,
  Zap,
  GitBranch,
  MessageSquareText,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";

const featureIcons = [Bot, Lightbulb, Zap, GitBranch, BookOpen, MessageSquareText];
const featureColors = [
  { color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/20" },
  { color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-900/20"   },
  { color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-900/20"     },
  { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
  { color: "text-primary-600 dark:text-primary-400", bg: "bg-primary-50 dark:bg-primary-900/20" },
  { color: "text-neutral-600 dark:text-neutral-400", bg: "bg-neutral-100 dark:bg-neutral-800"   },
];

const techStack = [
  "FastAPI", "LangGraph", "LangChain", "OpenAI API",
  "React 19", "TypeScript", "Vite", "Tailwind CSS", "Zustand", "TanStack Query",
];

export function HomePage() {
  const { t } = useI18n();
  const h = t.home;

  const stats = [
    { label: h.statsTypes,  value: "20+"          },
    { label: h.statsModes,  value: h.statsModesVal },
    { label: h.statsStack,  value: h.statsStackVal },
    { label: h.statsWords,  value: h.statsWordsVal },
  ];

  return (
    <div className="min-h-full bg-neutral-50 dark:bg-neutral-900">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden border-b border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-violet-50 opacity-60 dark:from-primary-950/40 dark:via-neutral-800 dark:to-violet-950/20" />
        <div className="relative mx-auto max-w-5xl px-6 py-16 text-center">
          <Badge variant="primary" className="mb-4 gap-1.5 px-3 py-1 text-xs">
            <Sparkles className="h-3 w-3" />
            {h.badge}
          </Badge>

          <h1 className="mb-4 text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-5xl">
            {h.heroTitle}
          </h1>

          <p className="mx-auto mb-8 max-w-2xl text-base leading-7 text-neutral-600 dark:text-neutral-300">
            {h.heroDesc}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/novel/agent/new">
              <Button className="gap-2 px-6 py-2.5 text-base shadow-md">
                <Bot className="h-5 w-5" />
                {h.ctaAgent}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/novel/ideas">
              <Button
                variant="outline"
                className="gap-2 border-amber-300 px-6 py-2.5 text-base text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
              >
                <Lightbulb className="h-5 w-5" />
                {h.ctaIdeas}
              </Button>
            </Link>
            <Link to="/novel">
              <Button variant="outline" className="gap-2 px-6 py-2.5 text-base">
                <BookOpen className="h-5 w-5" />
                {h.ctaMyNovels}
              </Button>
            </Link>
          </div>

          {/* Stats strip */}
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-neutral-700 dark:bg-neutral-800/80"
              >
                <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                  {value}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {h.featuresTitle}
          </h2>
          <p className="mt-2 text-sm text-neutral-500">{h.featuresSubtitle}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {h.features.map((feat, i) => {
            const Icon = featureIcons[i];
            const { color, bg } = featureColors[i];
            return (
              <div
                key={feat.title}
                className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {feat.title}
                </h3>
                <p className="text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                  {feat.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tech stack ── */}
      <div className="border-t border-neutral-200 bg-white py-8 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="mb-4 text-xs font-medium uppercase tracking-widest text-neutral-400">
            {h.techStackLabel}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {techStack.map((tech) => (
              <span
                key={tech}
                className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
