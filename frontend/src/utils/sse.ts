/**
 * Lightweight SSE client using the Fetch API + ReadableStream.
 *
 * Sends a POST request with a JSON body and reads the server-sent event stream.
 * Each SSE event is expected to have the format:
 *   data: {"type": "token"|"done"|"error", ...}\n\n
 */

export interface SSECallbacks {
  onToken: (text: string) => void;
  onDone: (data?: Record<string, unknown>) => void;
  onError: (message: string) => void;
}

export async function fetchSSE(
  url: string,
  body: unknown,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const token = localStorage.getItem("access_token");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    callbacks.onError(`Network error: ${(err as Error).message}`);
    return;
  }

  if (!response.ok) {
    callbacks.onError(`HTTP ${response.status}: ${response.statusText}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError("Response body is not readable");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on the SSE double-newline delimiter
      const messages = buffer.split("\n\n");
      // Last element may be an incomplete message — keep it in the buffer
      buffer = messages.pop() ?? "";

      for (const msg of messages) {
        const line = msg.trim();
        if (!line.startsWith("data: ")) continue;

        const dataStr = line.slice(6).trim();
        if (!dataStr) continue;

        try {
          const event = JSON.parse(dataStr) as { type: string; content?: string; data?: Record<string, unknown>; message?: string };

          if (event.type === "token" && event.content) {
            callbacks.onToken(event.content);
          } else if (event.type === "done") {
            callbacks.onDone(event.data);
          } else if (event.type === "error") {
            callbacks.onError(event.message ?? "Unknown error");
          }
        } catch {
          // Ignore malformed JSON lines
        }
      }
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      callbacks.onError(`Stream error: ${(err as Error).message}`);
    }
  } finally {
    reader.releaseLock();
  }
}
