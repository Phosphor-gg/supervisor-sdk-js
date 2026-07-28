import {
  AuthenticationError,
  RateLimitError,
  SupervisorError,
  ValidationError,
} from "./errors.js";
import { prepareImage } from "./imagePrep.js";
import { MAX_VIDEO_BYTES } from "./models.js";
import type {
  VideoModerationRequest,
  VideoModerationResponse,
  BatchModerationRequest,
  ErrorResponse,
  ModerationRequest,
  ModerationResponse,
  UsernameCheckResponse,
} from "./models.js";

const DEFAULT_BASE_URL = "https://supervisor.gg";

export interface SupervisorClientOptions {
  /** Your Supervisor API key. */
  apiKey: string;
  /** Base URL for the API. Defaults to https://supervisor.gg */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
}

/** Async client for the Supervisor content moderation API. */

/**
 * Accept whatever a caller is likely to have and return plain base64.
 *
 * Node gives Buffers and fs reads, browsers give File/Blob from an input, and
 * some callers already hold base64. Handled here so `moderateVideo` takes any
 * of them and the strings never round-trip through a decode.
 */
async function toBase64(input: Uint8Array | ArrayBuffer | Blob | string): Promise<string> {
  if (typeof input === "string") {
    // Already base64; strip a data URI prefix if present.
    return input.startsWith("data:") ? input.slice(input.indexOf(",") + 1) : input;
  }
  let bytes: Uint8Array;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else {
    bytes = new Uint8Array(await input.arrayBuffer());
  }
  // Buffer where it exists (Node), btoa elsewhere. Chunked so a large clip does
  // not blow the argument limit on String.fromCharCode.
  const maybeBuffer = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } })
    .Buffer;
  if (maybeBuffer) return maybeBuffer.from(bytes).toString("base64");
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

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
    const body = request.image
      ? { ...request, image: await prepareImage(request.image) }
      : request;
    return this.request("POST", "/api/moderate", body);
  }

  /**
   * Moderate a short video.
   *
   * Sends the clip to the API, which extracts the frames that actually differ
   * (scene cuts rather than every frame) and moderates those. A clip therefore
   * costs a handful of frames rather than hundreds.
   *
   * Requires the video-moderation entitlement on your plan.
   *
   * @param video - Video bytes, a Blob/File, or a base64 string.
   * @param options - Model and label options.
   * @returns Overall verdict plus a per-frame breakdown with timestamps, so a
   *   flagged moment can be located in the clip.
   * @throws If the clip is over MAX_VIDEO_BYTES. Checked locally, so an
   *   oversized video fails before it is uploaded.
   */
  async moderateVideo(
    video: Uint8Array | ArrayBuffer | Blob | string,
    options: Omit<VideoModerationRequest, "video"> = {},
  ): Promise<VideoModerationResponse> {
    const base64 = await toBase64(video);
    // 4 base64 chars per 3 bytes; padding makes this an upper bound.
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes > MAX_VIDEO_BYTES) {
      throw new Error(
        `Video is ${bytes} bytes, limit is ${MAX_VIDEO_BYTES} (${MAX_VIDEO_BYTES / (1024 * 1024)}MB)`,
      );
    }
    return this.request("POST", "/api/moderation/user/video", {
      ...options,
      video: base64,
    });
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
    let body: BatchModerationRequest = request;
    if (images && images.length > 0) {
      const prepared = await Promise.all(
        images.map((image) => (image ? prepareImage(image) : image)),
      );
      body = { ...request, images: prepared };
    }
    return this.request("POST", "/api/batch", body);
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
