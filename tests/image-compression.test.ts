import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImageForUpload } from "../lib/image-compression";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web image upload compression", () => {
  it("resizes wide images to 1024px and encodes JPEG at 0.75 quality", async () => {
    class MockImage {
      naturalWidth = 2000;
      naturalHeight = 1000;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        this.onload?.();
      }
    }

    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => "data:image/jpeg;base64,compressed");
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toDataURL,
    };
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });

    await expect(compressImageForUpload("blob:homework")).resolves.toEqual({
      base64: "compressed",
      mimeType: "image/jpeg",
    });
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(512);
    expect(drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 1024, 512);
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.75);
  });
});
