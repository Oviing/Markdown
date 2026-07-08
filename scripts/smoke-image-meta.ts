import { sniffImage, fitTo } from "../src/image-meta";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`
  );
}

// minimal 1×1 transparent PNG (real, decodable)
const PNG_1x1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);
check("png 1x1", sniffImage(PNG_1x1), { type: "png", width: 1, height: 1 });

// hand-built PNG header claiming 640×480
const png = new Uint8Array(24);
png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
png.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
png.set([0, 0, 2, 0x80, 0, 0, 1, 0xe0], 16); // 640, 480 big-endian
check("png header", sniffImage(png), { type: "png", width: 640, height: 480 });

// GIF89a 320×200 (little-endian)
const gif = new Uint8Array(10);
gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xc8, 0x00]);
check("gif header", sniffImage(gif), { type: "gif", width: 320, height: 200 });

// BMP 100×50 (BITMAPINFOHEADER, LE i32 at 18/22)
const bmp = new Uint8Array(26);
bmp.set([0x42, 0x4d]);
bmp.set([100, 0, 0, 0], 18);
bmp.set([50, 0, 0, 0], 22);
check("bmp header", sniffImage(bmp), { type: "bmp", width: 100, height: 50 });

// BMP top-down (negative height)
const bmpNeg = new Uint8Array(26);
bmpNeg.set([0x42, 0x4d]);
bmpNeg.set([100, 0, 0, 0], 18);
bmpNeg.set([0xce, 0xff, 0xff, 0xff], 22); // -50
check("bmp negative height", sniffImage(bmpNeg), { type: "bmp", width: 100, height: 50 });

// JPEG: SOI, APP0 stub, SOF0 with 480×640
const jpg = new Uint8Array([
  0xff, 0xd8, // SOI
  0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, len 4
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, // SOF0: height 480, width 640
]);
check("jpeg SOF0", sniffImage(jpg), { type: "jpg", width: 640, height: 480 });

check("garbage → null", sniffImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])), null);
check("truncated png → null", sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
check("empty → null", sniffImage(new Uint8Array(0)), null);

check("fit small image unchanged", fitTo({ type: "png", width: 300, height: 200 }), { width: 300, height: 200 });
check("fit wide image scales", fitTo({ type: "png", width: 1200, height: 800 }), { width: 600, height: 400 });
check("fit rounds height", fitTo({ type: "png", width: 900, height: 100 }), { width: 600, height: 67 });

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nimage-meta OK");
