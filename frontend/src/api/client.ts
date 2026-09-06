import axios, { AxiosError, AxiosInstance } from 'axios';
import type { ApiEnvelope, ApiErrorEnvelope } from '@/types/api';

/**
 * The single axios instance every request in the app goes through.
 *
 * Two things happen here that are worth knowing about:
 *   1. The bearer token is attached from storage on every request, so no caller
 *      ever has to think about auth headers.
 *   2. A 401 clears the session and bounces to /login exactly once - it does not
 *      matter how many parallel requests fail at the same moment.
 */

const TOKEN_STORAGE_KEY = 'rp.auth.token';

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_STORAGE_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_STORAGE_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_STORAGE_KEY),
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** First message for a field, ready to drop under an input. */
  firstError(field: string): string | undefined {
    return this.fieldErrors[field]?.[0];
  }
}

let isRedirectingToLogin = false;

function createClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    timeout: 20_000,
  });

  instance.interceptors.request.use((config) => {
    const token = tokenStore.get();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiErrorEnvelope>) => {
      const status = error.response?.status ?? 0;
      const payload = error.response?.data;

      if (status === 401 && !isRedirectingToLogin) {
        isRedirectingToLogin = true;
        tokenStore.clear();
        window.location.assign('/login');
      }

      if (status === 0) {
        return Promise.reject(
          new ApiError('Cannot reach the server. Check your connection and try again.', 0),
        );
      }

      return Promise.reject(
        new ApiError(
          payload?.message ?? 'Something went wrong. Try again.',
          status,
          payload?.errors ?? {},
        ),
      );
    },
  );

  return instance;
}

export const http = createClient();

/**
 * True when the request never reached a server - offline, DNS failure, or the
 * API is unreachable - as opposed to a business error the server rejected.
 * The bridge plan hinges on this distinction: a connectivity failure is safe
 * to retry under the same idempotency key, a validation error is not.
 */
export function isConnectivityError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

/** Unwraps the `data` envelope so callers work with plain domain objects. */
export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await http.get<ApiEnvelope<T>>(url, { params });
  return data.data;
}

/** Same as apiGet but keeps pagination meta, for list screens. */
export async function apiGetPaged<T>(url: string, params?: Record<string, unknown>) {
  const { data } = await http.get<ApiEnvelope<T>>(url, { params });
  return { items: data.data, pagination: data.meta?.pagination };
}

export async function apiPost<T>(url: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
  const { data } = await http.post<ApiEnvelope<T>>(url, body, { params });
  return data.data;
}

export async function apiPatch<T>(url: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
  const { data } = await http.patch<ApiEnvelope<T>>(url, body, { params });
  return data.data;
}

export async function apiPut<T>(url: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
  const { data } = await http.put<ApiEnvelope<T>>(url, body, { params });
  return data.data;
}

export async function apiDelete(url: string, params?: Record<string, unknown>): Promise<void> {
  await http.delete(url, { params });
}

/**
 * Uploads a single image as multipart form data. Content-Type is unset
 * rather than left as the instance's default 'application/json', so the
 * browser can set 'multipart/form-data' itself with the correct boundary.
 */
export async function apiUpload<T>(url: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await http.post<ApiEnvelope<T>>(url, formData, {
    headers: { 'Content-Type': undefined },
  });

  return data.data;
}
