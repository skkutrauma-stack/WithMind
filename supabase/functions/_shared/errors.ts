export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = 'HttpError';
  }
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function toHttpError(error: unknown) {
  if (error instanceof HttpError) return error;
  if (error instanceof Error) return new HttpError(500, error.message);
  return new HttpError(500, String(error));
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}
