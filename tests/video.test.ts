import { describe, expect, it, vi, afterEach } from "vitest";

import { SupervisorClient } from "../src/client.js";
import { MAX_VIDEO_BYTES } from "../src/models.js";

const RESPONSE = {
  flagged: true,
  labels: ["violence"],
  frames: [
    { timestamp_ms: 0, flagged: false, labels: [] },
    { timestamp_ms: 2133, flagged: true, labels: ["violence"] },
  ],
  frames_analysed: 2,
  duration_secs: 6.4,
  codec: "h264",
  decoder: "nvdec",
};

function mockFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return new Response(JSON.stringify(RESPONSE), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("moderateVideo", () => {
  it("posts the clip to the video route as base64", async () => {
    const calls = mockFetch();
    const client = new SupervisorClient({ apiKey: "sk_test", baseUrl: "http://api.test" });
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5]);

    const result = await client.moderateVideo(bytes);

    expect(calls[0].url).toContain("/api/moderation/user/video");
    expect(Buffer.from(calls[0].body.video as string, "base64")).toEqual(Buffer.from(bytes));
    expect(result.flagged).toBe(true);
    expect(result.frames_analysed).toBe(2);
    // Timestamps are the point: they locate the flagged moment in the clip.
    expect(result.frames.map((f) => f.timestamp_ms)).toEqual([0, 2133]);
    expect(result.decoder).toBe("nvdec");
  });

  it("rejects an oversized clip before uploading", async () => {
    const calls = mockFetch();
    const client = new SupervisorClient({ apiKey: "sk_test", baseUrl: "http://api.test" });
    const tooBig = new Uint8Array(MAX_VIDEO_BYTES + 1024);

    await expect(client.moderateVideo(tooBig)).rejects.toThrow(/limit is/);
    // The whole point of the local check: nothing went over the wire.
    expect(calls).toHaveLength(0);
  });

  it("accepts a Blob and a base64 string as well as bytes", async () => {
    const calls = mockFetch();
    const client = new SupervisorClient({ apiKey: "sk_test", baseUrl: "http://api.test" });

    await client.moderateVideo(new Blob([new Uint8Array([9, 9, 9])]));
    await client.moderateVideo("AAEC");
    await client.moderateVideo("data:video/mp4;base64,AAEC");

    expect(calls).toHaveLength(3);
    // A base64 input is passed through untouched, and a data URI has its prefix
    // stripped rather than being re-encoded.
    expect(calls[1].body.video).toBe("AAEC");
    expect(calls[2].body.video).toBe("AAEC");
  });

  it("forwards model and label options", async () => {
    const calls = mockFetch();
    const client = new SupervisorClient({ apiKey: "sk_test", baseUrl: "http://api.test" });

    await client.moderateVideo(new Uint8Array([1]), { model: "arbiter" as never });

    expect(calls[0].body.model).toBe("arbiter");
  });
});
