// Sniffs the format and intrinsic pixel size of an image from its bytes.
// Only the four formats docx's ImageRun embeds; anything else returns null
// and the exporter falls back to alt text.

export type ImageType = "png" | "jpg" | "gif" | "bmp";

export interface ImageMeta {
  type: ImageType;
  width: number;
  height: number;
}

function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}

function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function u16le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function i32le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
}

function pngMeta(b: Uint8Array): ImageMeta | null {
  // signature + IHDR length/type, then width/height at 16/20
  if (b.length < 24) return null;
  return { type: "png", width: u32be(b, 16), height: u32be(b, 20) };
}

function gifMeta(b: Uint8Array): ImageMeta | null {
  if (b.length < 10) return null;
  return { type: "gif", width: u16le(b, 6), height: u16le(b, 8) };
}

function bmpMeta(b: Uint8Array): ImageMeta | null {
  if (b.length < 26) return null;
  // BITMAPINFOHEADER; height may be negative (top-down rows)
  return { type: "bmp", width: i32le(b, 18), height: Math.abs(i32le(b, 22)) };
}

function jpgMeta(b: Uint8Array): ImageMeta | null {
  // walk segments until a start-of-frame marker carrying the dimensions
  let o = 2;
  while (o + 9 <= b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      o += 2;
      continue;
    }
    const size = u16be(b, o + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { type: "jpg", width: u16be(b, o + 7), height: u16be(b, o + 5) };
    }
    if (size < 2) return null;
    o += 2 + size;
  }
  return null;
}

export function sniffImage(bytes: Uint8Array): ImageMeta | null {
  const b = bytes;
  let meta: ImageMeta | null = null;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    meta = pngMeta(b);
  } else if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    meta = gifMeta(b);
  } else if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) {
    meta = bmpMeta(b);
  } else if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) {
    meta = jpgMeta(b);
  }
  if (!meta || meta.width <= 0 || meta.height <= 0) return null;
  return meta;
}

// Word's usable page width at 96dpi is ~600px; scale down preserving aspect.
export function fitTo(meta: ImageMeta, maxWidth = 600): { width: number; height: number } {
  if (meta.width <= maxWidth) return { width: meta.width, height: meta.height };
  const scale = maxWidth / meta.width;
  return { width: maxWidth, height: Math.max(1, Math.round(meta.height * scale)) };
}
