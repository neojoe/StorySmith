import { useQuery } from "@tanstack/react-query";
import { platformService } from "@/services/platform-service";
import { usePlatformStore, PLATFORM_USER_IDS } from "@/stores/platform-store";
import type { PlatformType } from "@/types/platform";

/** 检查账号登录状态，同步写入 store */
export function usePlatformLoginStatus(platform: PlatformType, enabled = true) {
  const { setPlatformConnected, setPlatformDisconnected } = usePlatformStore();
  const userId = PLATFORM_USER_IDS[platform];

  return useQuery({
    queryKey: [`${platform}-login-status`, userId],
    queryFn: async () => {
      const status = await platformService.checkLoginStatus(platform, userId);
      if (status.is_logged_in) {
        setPlatformConnected(platform, status.username ?? "未知昵称", status.avatar);
      } else {
        setPlatformDisconnected(platform);
      }
      return status;
    },
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}
