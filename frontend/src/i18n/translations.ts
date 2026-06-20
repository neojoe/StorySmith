export type Lang = "zh" | "en";

const translations = {
  zh: {
    // ── 通用 ──────────────────────────────────────────────────────
    common: {
      back: "返回",
      cancel: "取消",
      confirm: "确认",
      save: "保存",
      delete: "删除",
      create: "创建",
      loading: "加载中…",
      comingSoon: "敬请期待",
      openSourceOnly: "开源版暂不开放",
      retry: "重试",
    },

    // ── 导航栏 ────────────────────────────────────────────────────
    nav: {
      home: "首页",
      dashboard: "数据概览",
      // AI 创作分组
      aiCreation: "AI 创作",
      aiIdeas: "AI 灵感创作",
      novelFactory: "AI 小说创作",
      dramaFactory: "AI 漫剧工厂",
      // 平台分组
      platform: "平台",
      platformPublish: "平台发布",
    },

    // ── Header ────────────────────────────────────────────────────
    header: {
      appName: "StorySmith",
      toggleSidebar: "折叠侧边栏",
      switchTheme: "切换主题",
      switchLang: "English",
    },

    // ── 首页 ─────────────────────────────────────────────────────
    home: {
      badge: "AI Agent 驱动的网文创作平台",
      heroTitle: "StorySmith",
      heroDesc:
        "基于 LangGraph Multi-Agent 架构，通过自然语言对话驱动完整的网文创作流程。从灵感到定稿，大纲 → 章节 → 正文，全程 AI 辅助，所见即所得。",
      ctaAgent: "开始 Agent 创作",
      ctaIdeas: "AI 灵感创作",
      ctaMyNovels: "查看我的小说",
      statsTypes: "支持小说类型",
      statsModes: "Agent 生成模式",
      statsStack: "平台技术栈",
      statsWords: "章节字数控制",
      statsModesVal: "3 种",
      statsStackVal: "全开源",
      statsWordsVal: "精准",
      featuresTitle: "核心能力",
      featuresSubtitle: "从 Prompt 到正文，每个环节都有 AI 深度介入",
      techStackLabel: "技术栈",
      features: [
        {
          title: "AI Agent 全自动创作",
          description:
            "基于 LangGraph 多 Agent 框架，通过自然语言对话驱动大纲生成、章节规划和正文写作，像和编辑一起创作。",
        },
        {
          title: "AI 灵感引擎",
          description:
            "输入一句创意想法，AI 立刻扩展成完整故事方向、人物关系和梗概草稿，帮你快速突破创作瓶颈。",
        },
        {
          title: "SSE 流式实时预览",
          description:
            "大纲、章节、正文全程 SSE 流式输出，字字实时渲染，所见即所得，生成过程透明可控。",
        },
        {
          title: "多模式灵活切换",
          description:
            "支持「框架 + 第一章」轻量模式、「一次性全书生成」自动模式，以及 Agent 对话驱动的精细创作模式。",
        },
        {
          title: "完整工作台",
          description:
            "大纲编辑、章节管理、正文写作三合一工作台，支持 AI 自动保存、章节润色和一致性检查。",
        },
        {
          title: "开源可扩展",
          description:
            "FastAPI + LangChain 后端，React 19 前端，完整代码开源，可接入自定义模型和平台扩展。",
        },
      ],
    },

    // ── Dashboard ─────────────────────────────────────────────────
    dashboard: {
      title: "数据概览",
      subtitle: "当前创作进度一览，快速进入你的下一部作品",
      statProjects: "小说项目",
      statPublished: "已定稿",
      statDraft: "创作中",
      statWords: "累计生成字数",
      statUnit: "部",
      quickStartTitle: "快速开始",
      quickActions: [
        {
          label: "Agent 全自动创作",
          desc: "通过对话驱动 AI 完成大纲、章节到正文",
        },
        {
          label: "AI 灵感创作",
          desc: "一句话扩展成完整故事方向和梗概",
        },
        {
          label: "自定义创作",
          desc: "填写设定，选择生成模式，精细创作",
        },
      ],
      guideTitle: "创作流程指引",
      guideSteps: [
        { title: "选择创作方式", desc: "Agent 对话 / AI 灵感 / 自定义三种模式任选" },
        { title: "填写故事设定", desc: "世界观、人物、剧情、风格 — 越详细效果越好" },
        { title: "生成大纲和章节", desc: "AI 自动规划全书结构，支持随时调整" },
        { title: "逐章生成正文", desc: "单章或批量生成，自动保持前后文连贯" },
        { title: "定稿阅读", desc: "一键进入全屏阅读器，沉浸式查看成品" },
      ],
      enterFactory: "进入小说工厂",
    },

    // ── 平台页 ────────────────────────────────────────────────────
    platform: {
      title: "平台一键发布",
      description:
        "此功能支持将定稿小说一键发布到番茄小说、阅文（起点）、七猫小说等主流内容平台，通过浏览器自动化实现账号管理、章节上传和发布状态同步。",
      goNovel: "去创作小说",
      note: "如需了解平台发布功能的实现方案，可查看项目的完整私有版本或提交 Issue 交流。",
      platforms: [
        { name: "番茄小说", desc: "App 扫码登录，自动化发布" },
        { name: "阅文 / 起点", desc: "扫码登录，创建作品发章节" },
        { name: "七猫小说", desc: "手机号验证码登录发布" },
      ],
    },

    // ── 漫剧页 ────────────────────────────────────────────────────
    drama: {
      title: "AI 漫剧工厂",
      description:
        "AI 漫剧工厂支持从故事梗概自动生成剧情蓝图、角色资产、分镜脚本，并驱动 AI 生成关键帧和短视频片段，实现从文字到影像的一站式自动化创作流水线。",
      goNovel: "去创作 AI 小说",
      note: "如对漫剧工厂功能感兴趣，欢迎提交 Issue 或 Star 本仓库持续关注后续进展。",
      features: [
        { title: "剧情蓝图", desc: "AI 自动生成分幕、角色弧线与情节节点" },
        { title: "分镜制作", desc: "逐帧生成导演台镜头语言与提示词" },
        { title: "帧级渲染", desc: "接入图生视频 API 批量渲染成片" },
      ],
    },
  },

  en: {
    common: {
      back: "Back",
      cancel: "Cancel",
      confirm: "Confirm",
      save: "Save",
      delete: "Delete",
      create: "Create",
      loading: "Loading…",
      comingSoon: "Coming Soon",
      openSourceOnly: "Not available in open-source edition",
      retry: "Retry",
    },

    nav: {
      home: "Home",
      dashboard: "Dashboard",
      aiCreation: "AI Creation",
      aiIdeas: "AI Story Ideas",
      novelFactory: "AI Novel Studio",
      dramaFactory: "AI Drama Factory",
      platform: "Platform",
      platformPublish: "Platform Publish",
    },

    header: {
      appName: "StorySmith",
      toggleSidebar: "Toggle sidebar",
      switchTheme: "Switch theme",
      switchLang: "中文",
    },

    home: {
      badge: "AI Agent-Powered Novel Creation Platform",
      heroTitle: "StorySmith",
      heroDesc:
        "Powered by LangGraph Multi-Agent architecture. Drive the entire novel creation workflow through natural language conversation — from inspiration to final draft, Outline → Chapters → Content, with real-time AI assistance.",
      ctaAgent: "Start Agent Creation",
      ctaIdeas: "AI Story Ideas",
      ctaMyNovels: "My Novels",
      statsTypes: "Novel Genres",
      statsModes: "Agent Modes",
      statsStack: "Tech Stack",
      statsWords: "Word Count Control",
      statsModesVal: "3 Modes",
      statsStackVal: "Open Source",
      statsWordsVal: "Precise",
      featuresTitle: "Core Features",
      featuresSubtitle: "AI deeply involved at every stage from Prompt to final content",
      techStackLabel: "Tech Stack",
      features: [
        {
          title: "AI Agent Auto-Creation",
          description:
            "Drive outline generation, chapter planning, and content writing through natural language conversation with a LangGraph multi-agent framework.",
        },
        {
          title: "AI Inspiration Engine",
          description:
            "Enter one creative sentence, and AI instantly expands it into a complete story direction, character relationships, and plot draft.",
        },
        {
          title: "SSE Real-Time Preview",
          description:
            "Outline, chapters, and content are streamed in real-time via SSE — every word rendered as it's generated, fully transparent and controllable.",
        },
        {
          title: "Flexible Creation Modes",
          description:
            "Supports 「Framework + First Chapter」 light mode, 「Full Book Auto-Generation」 mode, and Agent conversation-driven fine-grained creation.",
        },
        {
          title: "Full Workspace",
          description:
            "All-in-one workspace for outline editing, chapter management, and content writing with AI auto-save, polishing, and consistency checks.",
        },
        {
          title: "Open Source & Extensible",
          description:
            "FastAPI + LangChain backend, React 19 frontend — fully open source and extensible with custom models and platform integrations.",
        },
      ],
    },

    dashboard: {
      title: "Dashboard",
      subtitle: "Your current creation overview — jump into your next project",
      statProjects: "Novel Projects",
      statPublished: "Finalized",
      statDraft: "In Progress",
      statWords: "Words Generated",
      statUnit: "",
      quickStartTitle: "Quick Start",
      quickActions: [
        {
          label: "Agent Auto-Creation",
          desc: "Let AI complete outline, chapters, and content through conversation",
        },
        {
          label: "AI Story Ideas",
          desc: "Expand one sentence into a full story direction and synopsis",
        },
        {
          label: "Custom Creation",
          desc: "Fill in settings, choose a generation mode, and create precisely",
        },
      ],
      guideTitle: "Creation Workflow Guide",
      guideSteps: [
        { title: "Choose Creation Mode", desc: "Agent chat / AI Ideas / Custom — pick any" },
        { title: "Fill in Story Settings", desc: "World, characters, plot, style — more detail = better result" },
        { title: "Generate Outline & Chapters", desc: "AI auto-plans the full structure, adjustable anytime" },
        { title: "Generate Chapter Content", desc: "Single or batch generation with automatic continuity" },
        { title: "Finalize & Read", desc: "One-click full-screen reader for an immersive reading experience" },
      ],
      enterFactory: "Enter Novel Factory",
    },

    platform: {
      title: "One-Click Platform Publishing",
      description:
        "Publish finalized novels to major platforms like Fanqie, Yuewen (Qidian), and Qimao with browser automation for account management, chapter uploads, and publish status sync.",
      goNovel: "Go Create a Novel",
      note: "Interested in platform publishing? Check the full private version or submit an Issue for updates.",
      platforms: [
        { name: "Fanqie Novel", desc: "Scan QR code via App, auto-publish" },
        { name: "Yuewen / Qidian", desc: "QR login, create works and publish chapters" },
        { name: "Qimao Novel", desc: "Phone number + verification code login" },
      ],
    },

    drama: {
      title: "AI Drama Factory",
      description:
        "Auto-generate story blueprints, character assets, and storyboard scripts from a story synopsis, then drive AI to generate keyframes and short video clips — a one-stop automation pipeline from text to video.",
      goNovel: "Go Create an AI Novel",
      note: "Interested in the AI Drama Factory? Star the repo or submit an Issue to follow upcoming releases.",
      features: [
        { title: "Story Blueprint", desc: "AI auto-generates acts, character arcs, and plot nodes" },
        { title: "Storyboarding", desc: "Frame-by-frame director language and prompt generation" },
        { title: "Frame Rendering", desc: "Connect image-to-video APIs for batch rendering" },
      ],
    },
  },
} as const;

export default translations;
export type Translations = typeof translations.zh;
