import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { authService } from "@/services/auth-service";

/**
 * Provides the current user and authentication state.
 * Automatically fetches /auth/me when a token is present.
 */
export function useAuth() {
  const { user, isAuthenticated, setUser, logout } = useAuthStore();
  const hasToken = Boolean(localStorage.getItem("access_token"));

  useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const me = await authService.getMe();
      setUser(me);
      return me;
    },
    enabled: hasToken && !isAuthenticated,
    retry: false,
  });

  return { user, isAuthenticated, logout };
}
