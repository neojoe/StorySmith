import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import type { ApiError } from "@/types/api";

// ─── Singleton Instance ────────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// ─── Request Interceptor: Attach Auth Token ────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response Interceptor: Normalize Errors ───────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status ?? 0;
    const data = error.response?.data as Record<string, unknown> | undefined;
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
      message = error.message ?? "An unexpected error occurred";
    }

    // Redirect to login on 401
    if (status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }

    const err = new Error(message) as Error & ApiError;
    err.status = status;
    return Promise.reject(err);
  },
);

export function resolveApiUrl(path: string) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const base = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/+$/, "");
  const root = base.endsWith("/api/v1") ? base.slice(0, -"/api/v1".length) : base;
  return `${root}${path.startsWith("/") ? path : `/${path}`}`;
}

export default apiClient;
