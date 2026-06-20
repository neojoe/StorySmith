// ── 平台类型 ───────────────────────────────────────────────────────────────────

export type PlatformType = "fanqie" | "yuewen" | "qimao";

export const PLATFORM_LABELS: Record<PlatformType, string> = {
  fanqie: "番茄小说",
  yuewen: "阅文 / 起点",
  qimao: "七猫小说",
};

// ── 账号状态 ───────────────────────────────────────────────────────────────────

export interface PlatformAccount {
  /** 后端用来隔离 cookie 的 user_id，暂时写死 "test01" */
  userId: string;
  /** 是否已登录 */
  isConnected: boolean;
  /** 登录后从平台拉取的真实昵称 */
  nickname?: string;
  /** 头像 URL */
  avatar?: string;
  /** 最近一次检查时间（ISO） */
  lastCheckedAt?: string;
}

export type FanqieAccount = PlatformAccount;
export type YuewenAccount = PlatformAccount;
export type QimaoAccount = PlatformAccount;

// ── 书籍信息（来自番茄作者中心）──────────────────────────────────────────────────

export interface FanqieBookInfo {
  book_id: string;
  book_name: string;
  abstract?: string;
  category?: string;
  word_count?: number;
  chapter_count?: number;
  creation_status?: 1 | 2;   // 1=连载中, 2=已完结
}

export interface YuewenBookInfo {
  book_id: string;
  title: string;
  cover_url?: string;
  status?: string;
  audit_status?: string;
}

export interface QimaoBookInfo {
  book_id: string;
  title: string;
  category?: string;
  subcategory?: string;
  client_name?: string;
  status?: string;
  settle_status?: number;
  can_publish_directly: boolean;
}

export interface FanqieWorkTag {
  id: string;
  name: string;
  rank: number;
  pre_rank?: number;
  child_list: string[];
  group_type?: number;
}

export interface FanqieWorkCategory {
  id: string;
  name: string;
  group: string[];
}

export interface YuewenSubCategory {
  subcategory_id: string;
  subcategory_name: string;
  description?: string;
}

export interface YuewenWorkCategory {
  category_id: string;
  category_name: string;
  freetype?: string;
  freetype_name?: string;
  site?: string;
  description?: string;
  subcategories: YuewenSubCategory[];
}

// ── 发布相关 ───────────────────────────────────────────────────────────────────

export interface PublishBookConfig {
  book_name: string;
  abstract: string;
  gender: 1 | 2;       // 1=男频 2=女频
  category?: string;
  cover_asset_id?: string;
}

export interface YuewenPublishBookConfig {
  title: string;
  intro: string;
  category_id: string;
  subcategory_id: string;
  site?: number;
  novel_group?: string;
}

export interface FanqieCoverAsset {
  asset_id: string;
  filename: string;
}

export type PublishMode = "publish" | "draft";

export interface PublishConfig extends PublishBookConfig {
  /** 选中要发布的 chapter id 列表（来自 NovelProject） */
  chapter_ids: string[];
  mode: PublishMode;
}

export type PublishStage =
  | "idle"
  | "creating_book"
  | "publishing_chapters"
  | "done"
  | "error";

export interface PublishProgress {
  stage: PublishStage;
  book_id?: string;
  current: number;
  total: number;
  currentTitle: string;
  errors: string[];
}
