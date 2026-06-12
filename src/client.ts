import {
  AuthenticationError,
  RateLimitError,
  SupervisorError,
  ValidationError,
} from "./errors.js";
import type {
  BatchModerationRequest,
  ErrorResponse,
  ModerationRequest,
  ModerationResponse,
  UsernameCheckResponse,
} from "./models.js";

const DEFAULT_BASE_URL = "https://api.supervisor.gg";

export interface SupervisorClientOptions {
  /** Your Supervisor API key. */
  apiKey: string;
  /** Base URL for the API. Defaults to https://api.supervisor.gg */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
}

/** Async client for the Supervisor content moderation API. */
export class SupervisorClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(options: SupervisorClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = options.timeout ?? 30000;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        await this.handleError(response);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async handleError(response: Response): Promise<never> {
    let message: string;
    let details: string | undefined;

    try {
      const body = (await response.json()) as ErrorResponse;
      message = body.error;
      details = body.details;
    } catch {
      message = response.statusText || "Unknown error";
    }

    const status = response.status;
    if (status === 401) throw new AuthenticationError(message, details);
    if (status === 429) throw new RateLimitError(message, details);
    if (status === 400 || status === 422)
      throw new ValidationError(status, message, details);
    throw new SupervisorError(status, message, details);
  }

  /**
   * Moderate text or an image for harmful content.
   *
   * @param request - Moderation request with text/image and options.
   * @returns ModerationResponse with flagged status and detected labels.
   */
  async moderate(request: ModerationRequest): Promise<ModerationResponse> {
    return this.request("POST", "/api/moderate", request);
  }

  /**
   * Moderate multiple texts in a single request.
   *
   * @param request - Batch request with texts array and options.
   * @returns Array of ModerationResponse, one per input text.
   */
  async moderateBatch(request: BatchModerationRequest): Promise<ModerationResponse[]> {
    const { texts, images } = request;
    if (
      texts &&
      texts.length > 0 &&
      images &&
      images.length > 0 &&
      texts.length !== images.length
    ) {
      throw new Error(
        `texts and images must have equal length when both are provided (got ${texts.length} texts and ${images.length} images)`,
      );
    }
    return this.request("POST", "/api/batch", request);
  }

  /**
   * Check a username for policy violations.
   *
   * @param username - The username to check.
   * @returns UsernameCheckResponse with flagged status and confidence score.
   */
  async checkUsername(username: string): Promise<UsernameCheckResponse> {
    return this.request("POST", "/api/username", { username });
  }

  /**
   * Get all available moderation labels.
   *
   * @returns Map of label name to its human-readable description.
   */
  async getLabels(): Promise<Record<string, string>> {
    return this.request("GET", "/api/labels");
  }
}
