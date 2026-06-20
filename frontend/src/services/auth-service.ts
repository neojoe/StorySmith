import apiClient from "./api-client";
import type { User, LoginCredentials, AuthTokens } from "@/types/auth";
import type { ApiResponse } from "@/types/api";

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const { data } = await apiClient.post<ApiResponse<AuthTokens>>(
      "/auth/login",
      credentials,
    );
    return data.data;
  },

  async logout(): Promise<void> {
    await apiClient.post("/auth/logout");
    localStorage.removeItem("access_token");
  },

  async getMe(): Promise<User> {
    const { data } = await apiClient.get<ApiResponse<User>>("/auth/me");
    return data.data;
  },

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const { data } = await apiClient.post<ApiResponse<AuthTokens>>(
      "/auth/refresh",
      { refreshToken },
    );
    return data.data;
  },
};
