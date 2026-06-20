/** Standard API response envelope */
export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

/** Paginated list response */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Common query params for list endpoints */
export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/** HTTP error shape */
export interface ApiError {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}
