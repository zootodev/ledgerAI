// Generates the LedgerAI app icons from src/app/icon.svg.
//
// Run with: node scripts/generate-icons.mjs
// Outputs (all committed):
//   src/app/favicon.ico       16/32/48 PNG-in-ICO
//   src/app/apple-icon.png    180x180, opaque
//   src/app/opengraph-image.png 1200x630
//   public/icon-192.png       manifest icon
//   public/icon-512.png       manifest icon
//   public/icon-maskable-192.png  maskable manifest icon
//   public/icon-maskable-512.png  maskable manifest icon
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = "#2563eb";
const INK = "#0f172a";
const MUTED = "#475569";
const SANS = "Arial, Helvetica, sans-serif";

const svg = readFileSync(join(root, "src/app/icon.svg"));
const mark = await loadImage(svg);

/** Render the scaled mark onto a transparent square canvas of `size` px. */
function renderMark(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(mark, 0, 0, size, size);
  return canvas;
}

/** PNG bytes of the mark at `size`. */
function markPng(size) {
  return renderMark(size).toBuffer("image/png");
}

/** Build a PNG-in-ICO container (Vista+ format) from {size, png} entries. */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4); // image count

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  const images = [];

  entries.forEach((entry, i) => {
    const base = i * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 0); // width
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1); // height
    directory.writeUInt8(0, base + 2); // palette count
    directory.writeUInt8(0, base + 3); // reserved
    directory.writeUInt16LE(1, base + 4); // color planes
    directory.writeUInt16LE(32, base + 6); // bits per pixel
    directory.writeUInt32LE(entry.png.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += entry.png.length;
    images.push(entry.png);
  });

  return Buffer.concat([header, directory, ...images]);
}

// --- favicon.ico (16, 32, 48) ---
const ico = buildIco([16, 32, 48].map((size) => ({ size, png: markPng(size) })));
writeFileSync(join(root, "src/app/favicon.ico"), ico);

// --- apple-icon.png (180x180, opaque) ---
{
  const canvas = createCanvas(180, 180);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, 180, 180);
  ctx.drawImage(mark, 0, 0, 180, 180);
  writeFileSync(join(root, "src/app/apple-icon.png"), canvas.toBuffer("image/png"));
}

// --- manifest icons (192, 512) ---
mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public/icon-192.png"), markPng(192));
writeFileSync(join(root, "public/icon-512.png"), markPng(512));

/** Opaque, full-bleed maskable icon with the mark inside the safe zone. */
function maskablePng(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, size, size);
  // Keep the mark within the central 80% safe zone.
  const inner = size * 0.72;
  const offset = (size - inner) / 2;
  const markCanvas = renderMark(size);
  // Punch the transparent corners to brand so nothing is see-through.
  ctx.drawImage(markCanvas, offset, offset, inner, inner);
  return canvas.toBuffer("image/png");
}

writeFileSync(join(root, "public/icon-maskable-192.png"), maskablePng(192));
writeFileSync(join(root, "public/icon-maskable-512.png"), maskablePng(512));

// --- opengraph-image.png (1200x630) ---
{
  const W = 1200;
  const H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Brand strip down the left edge.
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, 16, H);

  const iconSize = 240;
  const iconX = 96;
  const iconY = (H - iconSize) / 2;
  ctx.drawImage(mark, iconX, iconY, iconSize, iconSize);

  const textX = iconX + iconSize + 72;
  ctx.fillStyle = INK;
  ctx.font = `bold 112px ${SANS}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("LedgerAI", textX, H / 2 - 6);

  ctx.fillStyle = MUTED;
  ctx.font = `36px ${SANS}`;
  ctx.fillText("Financial intelligence for small businesses", textX, H / 2 + 62);

  writeFileSync(join(root, "src/app/opengraph-image.png"), canvas.toBuffer("image/png"));
}

console.log("Icons generated.");
