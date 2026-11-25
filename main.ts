// The World on Wednesday, 25 November 2026 - in one image.
//
// Entry program for the make.fun bounty news-image-20261125.
// Node 22, standard library only, no network. The program draws a
// one-page newspaper picture of the day's world news onto a raw
// pixel canvas with its own stroke lettering, encodes the canvas
// as a PNG and writes it to entry.png inside the output folder
// (MAKEFUN_OUTPUT_DIR when set, otherwise /output). Every step is
// fixed arithmetic, so two runs write byte-identical files.
//
// The day's stories, all first reported on Wednesday
// 25 November 2026 and checked that evening (WIB) against
// Reuters, AP and the wire roundups of the day:
//   lead  - two oil tankers strike naval mines in Hormuz
//   cards - US tariffs on 14 partners; Huawei guilty verdict;
//           the deepening AI sell-off; Shenzhou 24 carries the
//           first Pakistani astronaut; the Solomon Islands and
//           Australia treaty; Ukraine sinks a Russian warship
//           in a Libyan port while Russia strikes Odesa
//   strip - Sudan, Gaza, Colombia, COP31, the Canary Islands,
//           a flooded West Java gold mine, Senegal, Anthropic

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ----------------------------------------------------------------
// Canvas: a plain RGB pixel buffer with small drawing primitives.
// ----------------------------------------------------------------

const WIDTH = 1024;
const HEIGHT = 1024;

type Rgb = [number, number, number];

const pixels = new Uint8Array(WIDTH * HEIGHT * 3);

function putPixel(x: number, y: number, colour: Rgb): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= WIDTH || yi >= HEIGHT) return;
  const at = (yi * WIDTH + xi) * 3;
  pixels[at] = colour[0];
  pixels[at + 1] = colour[1];
  pixels[at + 2] = colour[2];
}

function fillRect(x: number, y: number, w: number, h: number, colour: Rgb): void {
  for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
    for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
      putPixel(xx, yy, colour);
    }
  }
}

function fillDisc(cx: number, cy: number, radius: number, colour: Rgb): void {
  const r2 = radius * radius;
  for (let yy = Math.floor(cy - radius); yy <= Math.ceil(cy + radius); yy++) {
    for (let xx = Math.floor(cx - radius); xx <= Math.ceil(cx + radius); xx++) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r2) putPixel(xx, yy, colour);
    }
  }
}

function strokeLine(
  x1: number, y1: number, x2: number, y2: number,
  thickness: number, colour: Rgb,
): void {
  const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillDisc(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thickness / 2, colour);
  }
}

function fillPolygon(points: Array<[number, number]>, colour: Rgb): void {
  let low = HEIGHT;
  let high = 0;
  for (const [, py] of points) {
    if (py < low) low = py;
    if (py > high) high = py;
  }
  for (let yy = Math.floor(low); yy <= Math.ceil(high); yy++) {
    const crossings: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) {
        crossings.push(ax + ((yy - ay) / (by - ay)) * (bx - ax));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      for (let xx = Math.round(crossings[i]); xx <= Math.round(crossings[i + 1]); xx++) {
        putPixel(xx, yy, colour);
      }
    }
  }
}

// ----------------------------------------------------------------
// Stroke lettering. Each glyph is a set of pen strokes on a grid
// 5 units wide and 7 units tall, drawn with round joints so the
// letters stay legible when the picture is shrunk for judging.
// ----------------------------------------------------------------

type Stroke = Array<[number, number]>;
type Glyph = Stroke[];

const GLYPHS: Record<string, Glyph> = {
  A: [[[0, 7], [2.5, 0], [5, 7]], [[1.3, 4.6], [3.7, 4.6]]],
  B: [
    [[0, 0], [0, 7]],
    [[0, 0], [3.1, 0], [4.3, 1.1], [4.3, 2.4], [3.1, 3.5], [0, 3.5]],
    [[0, 3.5], [3.4, 3.5], [4.6, 4.7], [4.6, 5.9], [3.4, 7], [0, 7]],
  ],
  C: [[[4.6, 1.3], [3.4, 0.2], [1.6, 0.2], [0.4, 1.4], [0.4, 5.6], [1.6, 6.8], [3.4, 6.8], [4.6, 5.7]]],
  D: [
    [[0, 0], [0, 7]],
    [[0, 0], [3, 0], [4.6, 1.8], [4.6, 5.2], [3, 7], [0, 7]],
  ],
  E: [[[4.6, 0], [0, 0], [0, 7], [4.6, 7]], [[0, 3.5], [3.6, 3.5]]],
  F: [[[4.6, 0], [0, 0], [0, 7]], [[0, 3.5], [3.6, 3.5]]],
  G: [[[4.6, 1.3], [3.4, 0.2], [1.6, 0.2], [0.4, 1.4], [0.4, 5.6], [1.6, 6.8], [3.6, 6.8], [4.6, 5.6], [4.6, 4.2], [2.9, 4.2]]],
  H: [[[0, 0], [0, 7]], [[5, 0], [5, 7]], [[0, 3.5], [5, 3.5]]],
  I: [[[2.5, 0], [2.5, 7]], [[0.9, 0], [4.1, 0]], [[0.9, 7], [4.1, 7]]],
  J: [[[1, 0], [4.6, 0], [4.6, 5.6], [3.4, 6.8], [1.6, 6.8], [0.4, 5.7]]],
  K: [[[0, 0], [0, 7]], [[4.6, 0], [0.2, 3.4]], [[1.4, 2.7], [4.6, 7]]],
  L: [[[0, 0], [0, 7], [4.6, 7]]],
  M: [[[0, 7], [0, 0], [2.5, 3.2], [5, 0], [5, 7]]],
  N: [[[0, 7], [0, 0], [5, 7], [5, 0]]],
  O: [[[1.6, 0.2], [3.4, 0.2], [4.6, 1.4], [4.6, 5.6], [3.4, 6.8], [1.6, 6.8], [0.4, 5.6], [0.4, 1.4], [1.6, 0.2]]],
  P: [
    [[0, 7], [0, 0]],
    [[0, 0], [3.2, 0], [4.4, 1.2], [4.4, 2.6], [3.2, 3.8], [0, 3.8]],
  ],
  Q: [
    [[1.6, 0.2], [3.4, 0.2], [4.6, 1.4], [4.6, 5.6], [3.4, 6.8], [1.6, 6.8], [0.4, 5.6], [0.4, 1.4], [1.6, 0.2]],
    [[3, 5], [5.1, 7.2]],
  ],
  R: [
    [[0, 7], [0, 0]],
    [[0, 0], [3.2, 0], [4.4, 1.2], [4.4, 2.6], [3.2, 3.8], [0, 3.8]],
    [[2.6, 3.8], [4.8, 7]],
  ],
  S: [[[4.6, 1.1], [3.4, 0.1], [1.5, 0.1], [0.4, 1.2], [0.4, 2.6], [1.6, 3.4], [3.4, 3.6], [4.6, 4.6], [4.6, 5.9], [3.4, 6.9], [1.5, 6.9], [0.4, 5.8]]],
  T: [[[0, 0], [5, 0]], [[2.5, 0], [2.5, 7]]],
  U: [[[0, 0], [0, 5.6], [1.2, 6.8], [3.8, 6.8], [5, 5.6], [5, 0]]],
  V: [[[0, 0], [2.5, 7], [5, 0]]],
  W: [[[0, 0], [1.2, 7], [2.5, 3.4], [3.8, 7], [5, 0]]],
  X: [[[0, 0], [5, 7]], [[5, 0], [0, 7]]],
  Y: [[[0, 0], [2.5, 3.2], [5, 0]], [[2.5, 3.2], [2.5, 7]]],
  Z: [[[0, 0], [5, 0], [0, 7], [5, 7]]],
  "0": [[[1.4, 0.2], [3.6, 0.2], [4.4, 1.4], [4.4, 5.6], [3.6, 6.8], [1.4, 6.8], [0.6, 5.6], [0.6, 1.4], [1.4, 0.2]]],
  "1": [[[1.4, 1.5], [3, 0], [3, 7]], [[1.2, 7], [4.4, 7]]],
  "2": [[[0.6, 1.3], [1.6, 0.2], [3.4, 0.2], [4.4, 1.4], [4.4, 2.6], [0.4, 7], [4.6, 7]]],
  "3": [
    [[0.6, 1.1], [1.8, 0.2], [3.2, 0.2], [4.3, 1.3], [4.3, 2.4], [3.2, 3.4], [1.9, 3.4]],
    [[3.2, 3.4], [4.4, 4.6], [4.4, 5.8], [3.2, 6.8], [1.6, 6.8], [0.5, 5.8]],
  ],
  "4": [[[3.4, 7], [3.4, 0], [0.2, 4.8], [4.8, 4.8]]],
  "5": [[[4.6, 0], [0.6, 0], [0.6, 3.2], [3.2, 3.2], [4.4, 4.4], [4.4, 5.8], [3.2, 6.8], [1.4, 6.8], [0.5, 5.8]]],
  "6": [[[4.2, 1.2], [2.8, 0.3], [1.2, 1.3], [0.5, 3], [0.5, 5.6], [1.6, 6.8], [3.4, 6.8], [4.5, 5.6], [4.5, 4.4], [3.4, 3.4], [1.8, 3.4], [0.6, 4.1]]],
  "7": [[[0.4, 0], [4.6, 0], [2.2, 7]]],
  "8": [
    [[1.7, 3.3], [0.7, 2.4], [0.7, 1.2], [1.7, 0.2], [3.3, 0.2], [4.3, 1.2], [4.3, 2.4], [3.3, 3.3], [1.7, 3.3]],
    [[1.7, 3.3], [0.5, 4.5], [0.5, 5.7], [1.7, 6.8], [3.3, 6.8], [4.5, 5.7], [4.5, 4.5], [3.3, 3.3]],
  ],
  "9": [[[0.8, 5.8], [2.2, 6.7], [3.8, 5.8], [4.5, 4], [4.5, 1.4], [3.4, 0.2], [1.6, 0.2], [0.5, 1.4], [0.5, 2.6], [1.6, 3.6], [3.2, 3.6], [4.4, 2.9]]],
  ".": [[[2.5, 6.5], [2.5, 6.9]]],
  ",": [[[2.7, 6.1], [2.3, 7.5]]],
  "'": [[[2.5, 0], [2.3, 1.7]]],
  "-": [[[0.8, 3.5], [4.2, 3.5]]],
  ":": [[[2.5, 2], [2.5, 2.4]], [[2.5, 5.2], [2.5, 5.6]]],
  ";": [[[2.5, 2], [2.5, 2.4]], [[2.7, 6.1], [2.3, 7.5]]],
  "!": [[[2.5, 0], [2.5, 4.7]], [[2.5, 6.5], [2.5, 6.9]]],
  "?": [
    [[0.6, 1.3], [1.7, 0.2], [3.3, 0.2], [4.4, 1.3], [4.4, 2.4], [2.5, 3.9], [2.5, 5]],
    [[2.5, 6.5], [2.5, 6.9]],
  ],
  "%": [
    [[0.4, 7], [4.6, 0]],
    [[1.2, 0.6], [2, 1.4], [1.2, 2.2], [0.4, 1.4], [1.2, 0.6]],
    [[3.8, 4.8], [4.6, 5.6], [3.8, 6.4], [3, 5.6], [3.8, 4.8]],
  ],
  "/": [[[0.6, 7], [4.4, 0]]],
  "(": [[[3.8, 0.4], [2.2, 1.7], [2.2, 5.3], [3.8, 6.6]]],
  ")": [[[1.2, 0.4], [2.8, 1.7], [2.8, 5.3], [1.2, 6.6]]],
  "+": [[[2.5, 1.6], [2.5, 5.4]], [[0.6, 3.5], [4.4, 3.5]]],
};

const ADVANCE = 6.1; // grid units per character cell

function textWidth(text: string, size: number): number {
  return (text.length * ADVANCE * size) / 7;
}

function drawText(
  text: string, x: number, y: number, size: number,
  colour: Rgb, weight = 0.13, align: "left" | "center" = "left",
): number {
  const unit = size / 7;
  let pen = align === "center" ? x - textWidth(text, size) / 2 : x;
  const thick = Math.max(1.1, size * weight);
  for (const raw of text.toUpperCase()) {
    if (raw !== " ") {
      const glyph = GLYPHS[raw];
      if (glyph) {
        for (const stroke of glyph) {
          for (let i = 0; i + 1 < stroke.length; i++) {
            strokeLine(
              pen + stroke[i][0] * unit, y + stroke[i][1] * unit,
              pen + stroke[i + 1][0] * unit, y + stroke[i + 1][1] * unit,
              thick, colour,
            );
          }
          if (stroke.length === 1) {
            fillDisc(pen + stroke[0][0] * unit, y + stroke[0][1] * unit, thick / 2, colour);
          }
        }
      }
    }
    pen += ADVANCE * unit;
  }
  return pen;
}

// Word wrap measured with the same advance the drawer uses.
function wrapText(text: string, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const trial = line === "" ? word : line + " " + word;
    if (textWidth(trial, size) <= maxWidth || line === "") {
      line = trial;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

function drawParagraph(
  text: string, x: number, y: number, size: number,
  maxWidth: number, colour: Rgb, lineGap = 1.45, weight = 0.12,
): number {
  let cursor = y;
  for (const line of wrapText(text, size, maxWidth)) {
    drawText(line, x, cursor, size, colour, weight);
    cursor += size * lineGap;
  }
  return cursor;
}

// ----------------------------------------------------------------
// Palette
// ----------------------------------------------------------------

const PAPER: Rgb = [246, 239, 221];
const INK: Rgb = [26, 24, 20];
const RED: Rgb = [164, 32, 28];
const DARKRED: Rgb = [122, 22, 20];
const NAVY: Rgb = [24, 52, 92];
const TEAL: Rgb = [16, 96, 92];
const GOLD: Rgb = [196, 138, 26];
const GREEN: Rgb = [44, 104, 52];
const PURPLE: Rgb = [92, 52, 128];
const WHITE: Rgb = [252, 250, 244];
const GREY: Rgb = [96, 92, 84];
const CARD: Rgb = [252, 248, 236];

// ----------------------------------------------------------------
// The lead illustration: two tankers ablaze in a mined strait.
// ----------------------------------------------------------------

function drawTanker(x: number, y: number, scale: number, hull: Rgb): void {
  // hull and stern block
  fillPolygon(
    [[x, y], [x + 190 * scale, y], [x + 172 * scale, y + 26 * scale], [x + 22 * scale, y + 26 * scale]],
    hull,
  );
  fillRect(x + 8 * scale, y - 16 * scale, 34 * scale, 16 * scale, hull);
  // deck tanks
  for (let i = 0; i < 4; i++) {
    fillRect(x + (58 + i * 32) * scale, y - 10 * scale, 24 * scale, 10 * scale, [120, 116, 108]);
  }
  // bridge tower
  fillRect(x + 150 * scale, y - 30 * scale, 22 * scale, 30 * scale, [228, 224, 214]);
  fillRect(x + 154 * scale, y - 26 * scale, 14 * scale, 6 * scale, NAVY);
}

function drawFlame(cx: number, cy: number, height: number): void {
  fillPolygon(
    [[cx - height * 0.30, cy], [cx, cy - height], [cx + height * 0.30, cy]],
    [232, 110, 24],
  );
  fillPolygon(
    [[cx - height * 0.18, cy], [cx + height * 0.05, cy - height * 0.68], [cx + height * 0.18, cy]],
    [246, 178, 44],
  );
  fillPolygon(
    [[cx - height * 0.08, cy], [cx + height * 0.02, cy - height * 0.38], [cx + height * 0.09, cy]],
    [252, 226, 130],
  );
}

function drawMine(cx: number, cy: number, r: number): void {
  fillDisc(cx, cy, r, [38, 40, 44]);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    strokeLine(
      cx, cy,
      cx + Math.cos(angle) * r * 1.55, cy + Math.sin(angle) * r * 1.55,
      3, [38, 40, 44],
    );
  }
  fillDisc(cx - r * 0.3, cy - r * 0.3, r * 0.22, [150, 154, 158]);
}

function drawLeadScene(x: number, y: number, w: number, h: number): void {
  // sky bands, then sea
  fillRect(x, y, w, h * 0.52, [188, 206, 224]);
  fillRect(x, y, w, h * 0.16, [204, 218, 232]);
  fillDisc(x + w * 0.84, y + h * 0.16, 24, [246, 196, 84]);
  fillRect(x, y + h * 0.52, w, h * 0.48, [36, 84, 128]);
  fillRect(x, y + h * 0.52, w, 5, [214, 228, 238]);
  // far headland
  fillPolygon(
    [[x, y + h * 0.52], [x + w * 0.30, y + h * 0.30], [x + w * 0.52, y + h * 0.52]],
    [104, 118, 104],
  );
  // smoke columns
  for (const [sx, sy, sr] of [[0.30, 0.30, 17], [0.36, 0.22, 22], [0.44, 0.15, 27], [0.72, 0.34, 14], [0.77, 0.27, 18]] as Array<[number, number, number]>) {
    fillDisc(x + w * sx, y + h * sy, sr, [110, 108, 104]);
    fillDisc(x + w * sx - 5, y + h * sy - 4, sr * 0.62, [140, 138, 132]);
  }
  // the two tankers
  drawTanker(x + w * 0.10, y + h * 0.60, 1.05, [52, 54, 58]);
  drawTanker(x + w * 0.52, y + h * 0.74, 0.82, [88, 44, 40]);
  // flames on both decks
  drawFlame(x + w * 0.33, y + h * 0.575, 74);
  drawFlame(x + w * 0.42, y + h * 0.585, 52);
  drawFlame(x + w * 0.70, y + h * 0.715, 56);
  // mines in the foreground water
  drawMine(x + w * 0.20, y + h * 0.90, 11);
  drawMine(x + w * 0.55, y + h * 0.94, 13);
  drawMine(x + w * 0.86, y + h * 0.88, 10);
  // wave strokes
  for (let i = 0; i < 9; i++) {
    const wy = y + h * (0.60 + i * 0.045);
    strokeLine(x + 14 + (i % 3) * 26, wy, x + 74 + (i % 3) * 26, wy, 2.4, [120, 168, 204]);
  }
}

// ----------------------------------------------------------------
// Story cards
// ----------------------------------------------------------------

interface CardSpec {
  kicker: string;
  colour: Rgb;
  headline: string;
  body: string;
}

function drawCard(spec: CardSpec, x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, CARD);
  fillRect(x, y, w, 7, spec.colour);
  strokeLine(x, y + h, x + w, y + h, 1.6, [210, 200, 176]);
  drawText(spec.kicker, x + 14, y + 14, 13, spec.colour, 0.17);
  let cursor = y + 38;
  for (const line of wrapText(spec.headline, 16.5, w - 28)) {
    drawText(line, x + 14, cursor, 16.5, INK, 0.155);
    cursor += 24;
  }
  drawParagraph(spec.body, x + 14, cursor + 4, 13, w - 28, [58, 54, 48], 1.5, 0.115);
}

// ----------------------------------------------------------------
// Compose the page
// ----------------------------------------------------------------

fillRect(0, 0, WIDTH, HEIGHT, PAPER);
// a whisper of paper grain from a fixed seed, identical every run
let seed = 20261125;
for (let i = 0; i < 2600; i++) {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  const gx = seed % WIDTH;
  seed = (seed * 1103515245 + 12345) % 2147483648;
  const gy = seed % HEIGHT;
  putPixel(gx, gy, [238, 230, 208]);
}
// frame
strokeLine(24, 24, 1000, 24, 3, INK);
strokeLine(24, 1000, 1000, 1000, 3, INK);
strokeLine(24, 24, 24, 1000, 3, INK);
strokeLine(1000, 24, 1000, 1000, 3, INK);

// masthead
drawText("THE WORLD IN ONE IMAGE", 512, 44, 43, INK, 0.16, "center");
drawText("A SINGLE PICTURE OF THE DAY'S NEWS - DRAWN ENTIRELY BY CODE", 512, 100, 14.5, GREY, 0.13, "center");

// date band
fillRect(36, 126, 952, 54, DARKRED);
drawText("WEDNESDAY 25 NOVEMBER 2026", 512, 137, 33, WHITE, 0.155, "center");

// lead story
drawText("LEAD - THE IRAN WAR AT SEA", 36, 198, 16, RED, 0.17);
drawText("TWO TANKERS HIT MINES IN", 36, 222, 37, INK, 0.16);
drawText("THE STRAIT OF HORMUZ", 36, 268, 37, INK, 0.16);
drawLeadScene(36, 318, 500, 178);
drawText("MINED WATERS: TANKERS ABLAZE IN THE STRAIT", 36, 504, 12.5, GREY, 0.12);

const leadBody =
  "IRAN'S REVOLUTIONARY GUARDS SAY TWO OIL TANKERS STRUCK NAVAL MINES, " +
  "EXPLODED AND CAUGHT FIRE ON AN UNAUTHORISED ROUTE THROUGH THE " +
  "WORLD'S BUSIEST OIL CHOKEPOINT.";
drawParagraph(leadBody, 560, 326, 15.5, 428, INK, 1.48, 0.12);
fillRect(560, 462, 428, 3, RED);
drawText("HOUTHIS CLAIM SAUDI REFINERY FIRE", 560, 474, 13.5, RED, 0.15);
drawText("RIYADH TOWER STRIKE INJURED 11", 560, 494, 13.5, RED, 0.15);

// story cards, two rows of three
const cards: CardSpec[] = [
  {
    kicker: "WASHINGTON - TRADE", colour: NAVY,
    headline: "US PROPOSES TARIFFS ON 14 PARTNERS",
    body: "NEW DUTIES TARGET EXCESS FACTORY CAPACITY. CHINA FACES THE STEEPEST RATES.",
  },
  {
    kicker: "NEW YORK - THE COURTS", colour: PURPLE,
    headline: "HUAWEI GUILTY OF FRAUD, THEFT PLOT",
    body: "BANK FRAUD AND A PLOT TO STEAL TRADE SECRETS PROVEN. RACKETEERING: NOT GUILTY.",
  },
  {
    kicker: "MARKETS - TOKYO, SEOUL", colour: GOLD,
    headline: "AI SELL-OFF DEEPENS ACROSS ASIA",
    body: "NIKKEI -2.8% AND SEOUL -6% AS TARIFF FEAR MEETS THE AI RECOIL. NVIDIA SLIDES AGAIN.",
  },
  {
    kicker: "SPACE - CHINA, PAKISTAN", colour: TEAL,
    headline: "FIRST PAKISTANI ASTRONAUT IN ORBIT",
    body: "SHENZHOU 24 CARRIES TWO CHINESE CREW AND ONE PAKISTANI TO THE TIANGONG STATION.",
  },
  {
    kicker: "PACIFIC - THE SOLOMONS", colour: GREEN,
    headline: "SOLOMONS BAR ANY FOREIGN BASE",
    body: "NEW TREATY NAMES AUSTRALIA ITS PRIMARY SECURITY PARTNER. NO FOREIGN BASE ALLOWED.",
  },
  {
    kicker: "TWO FRONTS - UKRAINE", colour: DARKRED,
    headline: "UKRAINE SINKS WARSHIP OFF LIBYA",
    body: "DRONES SINK A RUSSIAN WARSHIP IN PORT; TWO LIBYAN OFFICERS DIE. ODESA IS HIT TOO.",
  },
];

const cardW = 309;
const cardH = 164;
for (let i = 0; i < cards.length; i++) {
  const col = i % 3;
  const row = Math.floor(i / 3);
  drawCard(cards[i], 36 + col * (cardW + 12.5), 528 + row * (cardH + 10), cardW, cardH);
}

// the rest of the day, on a black strip
fillRect(36, 876, 952, 118, INK);
drawText("ALSO ON WEDNESDAY", 52, 888, 13, [246, 196, 84], 0.17);
const alsoText =
  "SUDAN: RSF DRONES KILL 19 CIVILIANS - GAZA: STRIKE KILLS HAMAS SECURITY CHIEF AND FAMILY - " +
  "COLOMBIA: ALL CARTAGENA HOSTAGES FREED - CLIMATE: POPE LEO LAMENTS COP31 FAILURE - " +
  "CANARY ISLANDS: RECORD 2,100 MIGRANTS IN A DAY - INDONESIA: MINERS TRAPPED IN FLOODED " +
  "JAVA GOLD MINE - SENEGAL AGAIN AFRICA CUP CHAMPION - ANTHROPIC BELOW IPO PRICE";
drawParagraph(alsoText, 52, 912, 12, 920, WHITE, 1.32, 0.115);

// ----------------------------------------------------------------
// PNG encoding: CRC32, IHDR, one IDAT, IEND. Fixed zlib settings
// keep the bytes identical from run to run.
// ----------------------------------------------------------------

const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE.push(c >>> 0);
}

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(kind: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(kind, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(kind, "ascii"), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const stride = WIDTH * 3;
  const raw = Buffer.alloc((stride + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
const target = join(outDir, "entry.png");
writeFileSync(target, encodePng());
console.log(`wrote ${target}`);
