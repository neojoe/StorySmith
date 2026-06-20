import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlatformAccount, PlatformType } from "@/types/platform";

/** 暂时写死的 user_id，未来接入用户管理体系后替换 */
export const PLATFORM_USER_IDS: Record<PlatformType, string> = {
  fanqie: "test01",
  yuewen: "test01",
  qimao: "test01",
};

const createInitialAccount = (platform: PlatformType): PlatformAccount => ({
  userId: PLATFORM_USER_IDS[platform],
  isConnected: false,
});

interface PlatformState {
  fanqie: PlatformAccount;
  yuewen: PlatformAccount;
  qimao: PlatformAccount;

  setPlatformConnected: (platform: PlatformType, nickname: string, avatar?: string) => void;
  setPlatformDisconnected: (platform: PlatformType) => void;
  setPlatformLastChecked: (platform: PlatformType) => void;
}

export const usePlatformStore = create<PlatformState>()(
  persist(
    (set) => ({
      fanqie: createInitialAccount("fanqie"),
      yuewen: createInitialAccount("yuewen"),
      qimao: createInitialAccount("qimao"),

      setPlatformConnected: (platform, nickname, avatar) =>
        set((s) => ({
          [platform]: {
            ...s[platform],
            isConnected: true,
            nickname,
            avatar,
            lastCheckedAt: new Date().toISOString(),
          },
        })),

      setPlatformDisconnected: (platform) =>
        set((s) => ({
          [platform]: {
            ...s[platform],
            isConnected: false,
            nickname: undefined,
            avatar: undefined,
            lastCheckedAt: new Date().toISOString(),
          },
        })),

      setPlatformLastChecked: (platform) =>
        set((s) => ({
          [platform]: { ...s[platform], lastCheckedAt: new Date().toISOString() },
        })),
    }),
    { name: "platform-store" },
  ),
);
