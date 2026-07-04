import {
  AuthenticationError,
  RateLimitError,
  SupervisorError,
  ValidationError,
} from "./errors.js";
import type {
  ConfirmAuthorizationResponse,
  ErrorResponse,
  ModerationResponse,
  PlatformChangePlanRequest,
  PlatformChangePlanResponse,
  PlatformCheckoutRequest,
  PlatformCheckoutResponse,
  PlatformModerationRequest,
  PlatformTokenResponse,
  PlatformUserInfo,
  ProvisionUserResponse,
  StripeConnectStatusResponse,
} from "./models.js";

const DEFAULT_BASE_URL = "https://supervisor.gg";

export interface PlatformClientOptions {
  /** Platform OAuth2 client ID. */
  clientId: string;
  /** Platform OAuth2 client secret. */
  clientSecret: string;
  /** Base URL for the API. Defaults to https://supervisor.gg */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
}

/**
 * Client for the Supervisor Platform API.
 * Handles OAuth2 client credentials token exchange and automatic refresh.
 */
export class PlatformClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private accessToken?: string;
  private tokenExpiresAt = 0;
  private refreshPromise?: Promise<string>;

  constructor(options: PlatformClientOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = options.timeout ?? 30000;
  }

  private async ensureToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 30000) {
      return this.accessToken;
    }

    // Coalesce concurrent refreshes into a single in-flight request so that
    // overlapping callers share one token exchange instead of each firing
    // their own.
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshToken().finally(() => {
        this.refreshPromise = undefined;
      });
    }

    return this.refreshPromise;
  }

  private async refreshToken(): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/platform/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: "client_credentials",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        await this.handleError(response);
      }

      const data = (await response.json()) as PlatformTokenResponse;
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
      return this.accessToken;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.ensureToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
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

  /** Provision or link a user by email. */
  async provisionUser(email: string): Promise<ProvisionUserResponse> {
    return this.request("POST", "/api/platform/users/provision", { email });
  }

  /** List all users linked to this platform. */
  async listUsers(): Promise<PlatformUserInfo[]> {
    return this.request("GET", "/api/platform/users");
  }

  /** Get a specific linked user by ID. */
  async getUser(userId: string): Promise<PlatformUserInfo> {
    return this.request("GET", `/api/platform/users/${userId}`);
  }

  /** Moderate content on behalf of a linked user. */
  async moderate(request: PlatformModerationRequest): Promise<ModerationResponse> {
    return this.request("POST", "/api/platform/moderate", request);
  }

  /** Create a Stripe checkout session for a platform user. */
  async createCheckout(request: PlatformCheckoutRequest): Promise<PlatformCheckoutResponse> {
    return this.request("POST", "/api/platform/checkout", request);
  }

  /** Change the plan of an existing subscription for a platform user. */
  async changePlan(request: PlatformChangePlanRequest): Promise<PlatformChangePlanResponse> {
    return this.request("POST", "/api/platform/change-plan", request);
  }

  /** Confirm a user's authorization with the provided code. */
  async confirmAuthorization(code: string): Promise<ConfirmAuthorizationResponse> {
    return this.request("POST", "/api/platform/users/confirm-authorization", { code });
  }

  /** Get the Stripe Connect onboarding status. */
  async getConnectStatus(): Promise<StripeConnectStatusResponse> {
    return this.request("GET", "/api/platform/connect/status");
  }
}
