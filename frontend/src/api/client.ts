import type {
  AuthResponse,
  FinishReason,
  SessionRecord,
} from '../contracts/api';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit,
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body !== undefined && options.body !== null) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(0, 'API server is unavailable');
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'detail' in payload &&
        typeof payload.detail === 'string'
      ) {
        message = payload.detail;
      }
    } catch {
      // Keep the status-based message when the response is not JSON.
    }

    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  login(username: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  startSession(
    token: string,
    durationSeconds: number,
  ): Promise<SessionRecord> {
    return request<SessionRecord>(
      '/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ duration_seconds: durationSeconds }),
      },
      token,
    );
  },

  pauseSession(token: string, sessionId: string): Promise<SessionRecord> {
    return request<SessionRecord>(
      `/sessions/${encodeURIComponent(sessionId)}/pause`,
      { method: 'POST' },
      token,
    );
  },

  resumeSession(token: string, sessionId: string): Promise<SessionRecord> {
    return request<SessionRecord>(
      `/sessions/${encodeURIComponent(sessionId)}/resume`,
      { method: 'POST' },
      token,
    );
  },

  recordWarning(token: string, sessionId: string): Promise<SessionRecord> {
    return request<SessionRecord>(
      `/sessions/${encodeURIComponent(sessionId)}/warnings`,
      {
        method: 'POST',
        body: JSON.stringify({ type: 'eyes_closed' }),
      },
      token,
    );
  },

  finishSession(
    token: string,
    sessionId: string,
    reason: FinishReason,
  ): Promise<SessionRecord> {
    return request<SessionRecord>(
      `/sessions/${encodeURIComponent(sessionId)}/finish`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
      token,
    );
  },
};
