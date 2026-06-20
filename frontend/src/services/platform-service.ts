import axios from "axios";
import apiClient from "./api-client";
import type {
  FanqieBookInfo,
  FanqieCoverAsset,
  FanqieWorkCategory,
  FanqieWorkTag,
  PlatformType,
  PublishBookConfig,
  QimaoBookInfo,
  YuewenBookInfo,
  YuewenPublishBookConfig,
  YuewenWorkCategory,
} from "@/types/platform";

/**
 * 平台 API 专用客户端：与 apiClient 共享 baseURL，但超时延长为 120s，
 * 因为番茄小说 UI 自动化（创建书籍/章节）单次操作可能耗时 30-60s。
 */
const platformClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  timeout: 120_000,
  headers: { "Content-Type": "application/json" },
});

platformClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

platformClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const data = err.response?.data as Record<string, unknown> | undefined;
    let message: string;
    if (typeof data?.message === "string") {
      message = data.message;
    } else if (typeof data?.detail === "string") {
      message = data.detail;
    } else if (Array.isArray(data?.detail)) {
      message = (data.detail as Array<{ msg?: string }>)
        .map((item) => item.msg ?? JSON.stringify(item))
        .join("; ");
    } else {
      message = err.message ?? "请求失败";
    }
    return Promise.reject(new Error(message));
  },
);

const PLATFORM_BASES: Record<PlatformType, string> = {
  fanqie: "/platform/fanqienovel",
  yuewen: "/platform/yuewen",
  qimao: "/platform/qimao",
};

const getPlatformBase = (platform: PlatformType) => PLATFORM_BASES[platform];

// ── 登录相关 ───────────────────────────────────────────────────────────────────

export interface QrcodeResponse {
  is_logged_in: boolean;
  img?: string;       // base64 PNG，格式：data:image/png;base64,...
  timeout: string;
}

export interface LoginStatus {
  is_logged_in: boolean;
  user_id?: string;
  username?: string;
  avatar?: string;
  phone?: string;
}

export interface QimaoSendCodeResponse {
  success: boolean;
  captcha_required: boolean;
  message: string;
}

export interface QimaoPhoneLoginResponse {
  success: boolean;
  message: string;
  user?: LoginStatus;
}

export const platformService = {
  /** 获取登录二维码（若已登录则直接返回 is_logged_in=true） */
  async getQrcode(platform: PlatformType, userId: string): Promise<QrcodeResponse> {
    if (platform === "qimao") {
      throw new Error("七猫小说请使用手机号和验证码登录");
    }
    const { data } = await platformClient.get<QrcodeResponse>(`${getPlatformBase(platform)}/login/qrcode`, {
      params: { user_id: userId },
    });
    return data;
  },

  async sendQimaoSmsCode(userId: string, phone: string): Promise<QimaoSendCodeResponse> {
    const { data } = await platformClient.post<QimaoSendCodeResponse>(
      `${getPlatformBase("qimao")}/login/send-code`,
      { phone },
      { params: { user_id: userId }, timeout: 180_000 },
    );
    return data;
  },

  async loginQimaoWithPhone(userId: string, phone: string, code: string): Promise<QimaoPhoneLoginResponse> {
    const { data } = await platformClient.post<QimaoPhoneLoginResponse>(
      `${getPlatformBase("qimao")}/login/phone`,
      { phone, code },
      { params: { user_id: userId }, timeout: 180_000 },
    );
    return data;
  },

  /** 检查登录状态 */
  async checkLoginStatus(platform: PlatformType, userId: string): Promise<LoginStatus> {
    const { data } = await platformClient.get<LoginStatus>(`${getPlatformBase(platform)}/login/status`, {
      params: { user_id: userId },
    });
    return data;
  },

  /** 退出登录（删除本地 cookie） */
  async logout(platform: PlatformType, userId: string): Promise<void> {
    await platformClient.delete(`${getPlatformBase(platform)}/login`, {
      params: { user_id: userId },
    });
  },

  // ── 书籍/章节创建（UI 自动化，耗时长，使用 120s 超时客户端）──────────────────

  /** 创建书籍，返回 book_id */
  async createBook(
    platform: PlatformType,
    userId: string,
    config: PublishBookConfig | YuewenPublishBookConfig,
  ): Promise<{ success: boolean; book_id?: string; message: string }> {
    if (platform === "qimao") {
      throw new Error("七猫当前仅支持在已有已过审书籍下发布章节");
    }
    if (platform === "fanqie") {
      const fanqieConfig = config as PublishBookConfig;
      const { data } = await platformClient.post(
        `${getPlatformBase(platform)}/author/books`,
        {
          book_name: fanqieConfig.book_name,
          abstract: fanqieConfig.abstract,
          gender: fanqieConfig.gender,
          category: fanqieConfig.category || undefined,
          cover_asset_id: fanqieConfig.cover_asset_id || undefined,
        },
        { params: { user_id: userId } },
      );
      return data;
    }

    const yuewenConfig = config as YuewenPublishBookConfig;
    const { data } = await platformClient.post(
      `${getPlatformBase(platform)}/books`,
      {
        title: yuewenConfig.title,
        intro: yuewenConfig.intro,
        category_id: yuewenConfig.category_id,
        subcategory_id: yuewenConfig.subcategory_id,
        site: yuewenConfig.site ?? 5,
        novel_group: yuewenConfig.novel_group || undefined,
      },
      { params: { user_id: userId } },
    );
    return data;
  },

  /** 上传番茄书籍封面素材 */
  async uploadCover(userId: string, file: File): Promise<FanqieCoverAsset> {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await platformClient.post<FanqieCoverAsset>(
      `${getPlatformBase("fanqie")}/cover-assets`,
      formData,
      {
        params: { user_id: userId },
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return data;
  },

  /** 创建章节（单章操作约 30-60s） */
  async createChapter(
    platform: PlatformType,
    userId: string,
    payload: {
      book_id: string;
      title: string;
      content: string;
      auto_publish: boolean;
    },
  ): Promise<{ success: boolean; chapter_id?: string; message: string }> {
    const path = platform === "fanqie" ? "/author/chapters" : "/chapters";
    const { data } = await platformClient.post(
      `${getPlatformBase(platform)}${path}`,
      payload,
      { params: { user_id: userId }, timeout: 180_000 },
    );
    return data;
  },

  async getBookList(platform: PlatformType, userId: string): Promise<FanqieBookInfo[] | YuewenBookInfo[] | QimaoBookInfo[]> {
    const path = platform === "fanqie" ? "/author/books" : "/books";
    const { data } = await apiClient.get<FanqieBookInfo[] | YuewenBookInfo[] | QimaoBookInfo[]>(`${getPlatformBase(platform)}${path}`, {
      params: { user_id: userId },
    });
    return data;
  },

  /** 获取番茄创建作品主分类（根据男频/女频动态变化） */
  async getFanqieWorkCategories(userId: string, gender: 1 | 2): Promise<FanqieWorkCategory[]> {
    const { data } = await apiClient.get<FanqieWorkCategory[]>(`${getPlatformBase("fanqie")}/work-categories`, {
      params: { user_id: userId, gender },
    });
    return data;
  },

  /** 获取番茄作品标签热词（后续可用于二级标签） */
  async getWorkTags(userId: string, gender: 1 | 2): Promise<FanqieWorkTag[]> {
    const { data } = await apiClient.get<FanqieWorkTag[]>(`${getPlatformBase("fanqie")}/work-tags`, {
      params: { user_id: userId, gender },
    });
    return data;
  },

  /** 获取阅文创建作品的频道分类树 */
  async getYuewenWorkTypes(
    userId: string,
    freetype: "1" | "2",
    site = 5,
  ): Promise<YuewenWorkCategory[]> {
    const { data } = await apiClient.get<YuewenWorkCategory[]>(`${getPlatformBase("yuewen")}/work-types`, {
      params: { user_id: userId, freetype, site },
    });
    return data;
  },
};
