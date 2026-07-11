import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareImage } from "../src/imagePrep.js";

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

describe("prepareImage (Node sharp path)", () => {
  it("downscales a large PNG to JPEG with longest edge 1280 and aspect preserved", async () => {
    const png = await sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    })
      .png()
      .toBuffer();

    const result = await prepareImage(toBase64(png));
    const meta = await sharp(fromBase64(result)).metadata();

    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBe(1280);
    // Aspect ratio 3:2 preserved (within rounding).
    expect(meta.width).toBe(1280);
    expect(Math.abs(meta.height! - (1280 * 2000) / 3000)).toBeLessThanOrEqual(1);
  });

  it("flattens RGBA input: output has no alpha channel", async () => {
    const rgba = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 4,
        background: { r: 10, g: 120, b: 240, alpha: 0.4 },
      },
    })
      .png()
      .toBuffer();

    const result = await prepareImage(toBase64(rgba));
    const meta = await sharp(fromBase64(result)).metadata();

    expect(meta.format).toBe("jpeg");
    expect(meta.hasAlpha).toBe(false);
    expect(meta.channels).toBe(3);
  });

  it("strips a data URL prefix and still processes the image", async () => {
    const png = await sharp({
      create: {
        width: 1600,
        height: 1600,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await prepareImage(`data:image/png;base64,${toBase64(png)}`);

    expect(result.startsWith("data:")).toBe(false);
    const meta = await sharp(fromBase64(result)).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(1280);
  });

  it("returns garbage/non-image base64 unchanged", async () => {
    const garbage = Buffer.from("this is definitely not an image").toString("base64");
    await expect(prepareImage(garbage)).resolves.toBe(garbage);
  });

  it("returns non-base64 garbage unchanged", async () => {
    const input = "!!!not-base64-at-all!!!";
    await expect(prepareImage(input)).resolves.toBe(input);
  });

  it("keeps dimensions of small images (no upscaling)", async () => {
    const png = await sharp({
      create: {
        width: 50,
        height: 40,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();
    const input = toBase64(png);

    const result = await prepareImage(input);
    const meta = await sharp(fromBase64(result)).metadata();

    expect(meta.width).toBe(50);
    expect(meta.height).toBe(40);
    // Output is either the untouched original, or a JPEG strictly smaller
    // than the input bytes.
    if (result !== input) {
      expect(meta.format).toBe("jpeg");
      expect(fromBase64(result).length).toBeLessThan(png.length);
    }
  });

  it("keeps the original when re-encoding a small image would grow it", async () => {
    // A tiny solid-white PNG compresses far better than JPEG: prepareImage
    // must return the original untouched.
    const png = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();
    const input = toBase64(png);

    await expect(prepareImage(input)).resolves.toBe(input);
  });
});
