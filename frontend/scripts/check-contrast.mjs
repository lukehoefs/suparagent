// Fails when a text colour on a surface falls under WCAG AA in either theme.
//
//   node scripts/check-contrast.mjs
//
// Reads the colour tokens straight from app/globals.css, so the check cannot drift from what
// the page uses. Node only, no packages. Exits 1 with one line per failing pair.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app", "globals.css"), "utf8").replace(/\r\n/g, "\n");

// The custom properties declared in the first block whose selector contains `selector`.
export function tokens(source, selector) {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  const found = {};
  for (const match of source.slice(open + 1, close).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) found[match[1]] = match[2].trim();
  return found;
}

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// A colour as [r, g, b] (0-255) and its alpha: `#rrggbb`, `rgba(r,g,b,a)` or `rgb(r g b / a)`.
export function parse(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const v = parseInt(hex[1], 16);
    return { rgb: [(v >> 16) & 255, (v >> 8) & 255, v & 255], alpha: 1 };
  }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(value);
  if (rgba) return { rgb: [+rgba[1], +rgba[2], +rgba[3]], alpha: +rgba[4] };
  const modern = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (modern) return { rgb: [+modern[1], +modern[2], +modern[3]], alpha: modern[4] === undefined ? 1 : +modern[4] };
  throw new Error(`not a #rrggbb, rgba() or rgb() colour: ${value}`);
}

// Colours laid one over the next, bottom first: the solid [r, g, b] the stack makes. The bottom is
// a solid colour (a string or an [r, g, b] already worked out); each layer may be translucent.
export function stack(bottom, ...layers) {
  let rgb = typeof bottom === "string" ? parse(bottom).rgb : bottom;
  if (typeof bottom === "string" && parse(bottom).alpha !== 1) throw new Error(`the bottom of a stack must be solid: ${bottom}`);
  for (const layer of layers) {
    const top = parse(layer);
    rgb = top.rgb.map((c, i) => c * top.alpha + rgb[i] * (1 - top.alpha));
  }
  return rgb;
}

// HSL lightness and hue (degrees) and chroma, each 0-100 except hue, of an [r, g, b].
export function hsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let hue = 0;
  if (d > 0) hue = max === R ? 60 * (((G - B) / d) % 6) : max === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
  return { lightness: ((max + min) / 2) * 100, hue: (hue + 360) % 360, chroma: d * 100 };
}

// A translucent fill as the solid colour it makes over `under` (a solid colour).
export function over(value, under) {
  const top = parse(value), base = parse(under);
  return top.rgb.map((c, i) => Math.round(c * top.alpha + base.rgb[i] * (1 - top.alpha)));
}

function luminanceOf([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function luminance(hex) {
  const { rgb, alpha } = parse(hex);
  if (alpha !== 1) throw new Error(`a translucent colour needs a background: ${hex}`);
  return luminanceOf(rgb);
}

// Contrast of `a` on `b`; a translucent `b` is first laid over `ground` (the page).
export function ratio(a, b, ground = "#ffffff") {
  return ratioOf(over(a, ground), over(b, ground));
}

// Contrast of two solid [r, g, b] colours.
export function ratioOf(a, b) {
  const [hi, lo] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground token, background token, minimum ratio]. Text is 4.5; the faint ink is used
// only for small secondary text, so it holds 4.5 too.
const SURFACES = ["bg-app", "bg-surface", "bg-raised", "bg-hover", "bg-inset"];
const PAIRS = [
  ...SURFACES.flatMap((bg) => [["ink", bg, 4.5], ["ink-muted", bg, 4.5], ["ink-faint", bg, 4.5]]),
  ["accent-fg", "accent", 4.5],
  // Accent text and links use accent-text; the accent itself is a fill with white on it.
  ...["bg-app", "bg-surface", "bg-raised", "accent-bg"].map((bg) => ["accent-text", bg, 4.5]),
  ...["bg-app", "bg-surface", "bg-raised"].flatMap((bg) => [
    ["success", bg, 4.5], ["warning", bg, 4.5], ["danger", bg, 4.5], ["running", bg, 4.5],
  ]),
  // Status pills: the -on text on the pale -bg fill.
  ["success-on", "success-bg", 4.5],
  ["warning-on", "warning-bg", 4.5],
  ["danger-on", "danger-bg", 4.5],
  ["running-on", "running-bg", 4.5],
  ["gray-on", "bg-hover", 4.5],
  ["accent-fg", "danger-fill", 4.5],
  // The keyboard focus ring is a UI component, held to 3:1 against what it sits on.
  ...["bg-app", "bg-surface", "bg-raised", "bg-hover"].map((bg) => ["focus", bg, 3]),
  // An off switch's track (ui/Switch.tsx) is a UI component too: 3:1 on the grounds it sits on.
  ...["bg-surface", "bg-raised"].map((bg) => ["toggle-off", bg, 3]),
  ["ink", "bubble-user", 4.5],
  ["ink", "code-bg", 4.5],
];

// Glass. A glass fill is translucent, so the colour text sits on is the fill laid over whatever is
// behind it. The blur averages that backdrop into one flat colour, so each surface is checked over
// the worst flat colours it can plausibly sit on:
// - floating panels (glass, glass-strong): busy content averaging 50% grey, and the modal scrim laid
//   over that busy content, the page or the canvas (a dialog or sheet always has the scrim between it
//   and the page, so for those the scrim over busy content is the worst case);
// - chrome on the main surface (glass-chrome): the canvas and its wash, the page, and content
//   scrolling under it (dense text and pictures, averaging --line-strong);
// - chrome on the canvas (glass-canvas): the canvas and its wash, and the page.
// The canvas itself is checked bare too ("wash"), so the wash holds with no glass over it.
const MID_GREY = "#808080";
const GLASS_FILL = { wash: null, glass: "glass-bg", "glass-strong": "glass-bg-strong", "glass-chrome": "glass-bg-chrome", "glass-canvas": "glass-bg-canvas" };
const STATUS = ["success", "warning", "danger", "running"];

// The canvas with each wash glow over it, and with both (where they meet, the most it moves).
function canvases(set) {
  return {
    canvas: stack(set["bg-app"]),
    "canvas + wash a": stack(set["bg-app"], set["wash-a"]),
    "canvas + wash b": stack(set["bg-app"], set["wash-b"]),
    "canvas + both washes": stack(set["bg-app"], set["wash-a"], set["wash-b"]),
  };
}

export function glassBackdrops(set) {
  const canvas = canvases(set);
  const floating = {
    "mid-grey content": stack(MID_GREY),
    "scrim over mid-grey content": stack(MID_GREY, set["glass-scrim"]),
    "scrim over the page": stack(set["bg-surface"], set["glass-scrim"]),
    ...Object.fromEntries(Object.entries(canvas).map(([name, rgb]) => [`scrim over the ${name}`, stack(rgb, set["glass-scrim"])])),
  };
  return {
    wash: canvas,
    glass: floating,
    "glass-strong": floating,
    "glass-chrome": { ...canvas, page: stack(set["bg-surface"]), "content scrolling under": stack(set["line-strong"]) },
    "glass-canvas": { ...canvas, page: stack(set["bg-surface"]) },
  };
}

// [foreground, chip under it or null, minimum] for each glass surface. Ink, muted, faint and accent
// text hold 4.5 everywhere. Plain .glass carries status only as icons and dots (3:1); a surface
// with a status word or pill uses glass-strong or sits in chrome, where the status colours hold 4.5
// as text and the pills (the -on text on its -bg chip, translucent in the dark theme) hold 4.5.
function glassPairs(variant) {
  const words = variant !== "glass";
  return [
    ...["ink", "ink-muted", "ink-faint", "accent-text"].map((fg) => [fg, null, 4.5]),
    ...STATUS.map((fg) => [fg, null, words ? 4.5 : 3]),
    ...(words ? STATUS.map((s) => [`${s}-on`, `${s}-bg`, 4.5]) : []),
    ["focus", null, 3],
    // A select's chosen row (ui/Select.tsx: bg-accent/15, text-accent-text) and an off switch in a dialog.
    ...(variant === "glass-strong" ? [["accent-text", "accent/15", 4.5], ["toggle-off", null, 3]] : []),
  ];
}

function chip(set, name) {
  const [token, percent] = name.split("/");
  if (!percent) return set[token];
  const { rgb } = parse(set[token]);
  return `rgba(${rgb.join(",")},${+percent / 100})`;
}

// Every glass pair in one theme: [variant, foreground, chip, backdrop name, ratio, minimum].
export function glassRatios(set) {
  const rows = [];
  for (const [variant, grounds] of Object.entries(glassBackdrops(set))) {
    const fill = GLASS_FILL[variant];
    for (const [ground, behind] of Object.entries(grounds)) {
      const surface = fill ? stack(behind, set[fill]) : behind;
      for (const [fg, under, min] of glassPairs(variant)) {
        const bg = under ? stack(surface, chip(set, under)) : surface;
        rows.push([variant, fg, under, ground, ratioOf(stack(set[fg]), bg), min]);
      }
    }
  }
  return rows;
}

// The wash stays a soft blue-grey: within 4% lightness of the canvas, hue 205-225 (blue-grey, well
// clear of the indigo accent's 240s), chroma 6% or less.
function washFailures(name, set) {
  const failures = [];
  const base = hsl(stack(set["bg-app"])).lightness;
  for (const [ground, rgb] of Object.entries(canvases(set))) {
    const { lightness, hue, chroma } = hsl(rgb);
    if (Math.abs(lightness - base) > 4) failures.push(`${name}: the ${ground} is ${lightness.toFixed(1)}% light, more than 4% from the canvas's ${base.toFixed(1)}%`);
    if (chroma > 0.5 && (hue < 205 || hue > 225)) failures.push(`${name}: the ${ground} has hue ${hue.toFixed(0)}, outside the blue-grey 205-225`);
    if (chroma > 6) failures.push(`${name}: the ${ground} has ${chroma.toFixed(1)}% chroma, more than 6%`);
  }
  return failures;
}

export function check() {
  const shared = tokens(css, ":root {\n  --identity-1");
  const themes = { light: tokens(css, ':root,\n:root[data-theme="light"]'), dark: tokens(css, ':root[data-theme="dark"]') };
  const failures = [];
  for (const [name, set] of Object.entries(themes)) {
    for (const [fg, bg, min] of PAIRS) {
      const got = ratio(set[fg], set[bg], set["bg-surface"]);
      if (got < min) failures.push(`${name}: ${fg} ${set[fg]} on ${bg} ${set[bg]} is ${got.toFixed(2)}:1, needs ${min}:1`);
    }
    failures.push(...washFailures(name, set));
    for (const [variant, fg, under, ground, got, min] of glassRatios(set)) {
      if (got < min) failures.push(`${name}: ${fg}${under ? ` on ${under}` : ""} on ${variant} over ${ground} is ${got.toFixed(2)}:1, needs ${min}:1`);
    }
  }
  for (let i = 1; i <= 10; i++) {
    const got = ratio("#ffffff", shared[`identity-${i}`]);
    if (got < 4.5) failures.push(`identity-${i} ${shared[`identity-${i}`]} with white text is ${got.toFixed(2)}:1, needs 4.5:1`);
  }
  return failures;
}

// `--glass`: the lowest ratio of each text token on each glass surface, and the backdrop it is on.
function report() {
  const themes = { light: tokens(css, ':root,\n:root[data-theme="light"]'), dark: tokens(css, ':root[data-theme="dark"]') };
  for (const [name, set] of Object.entries(themes)) {
    const worst = new Map();
    for (const row of glassRatios(set)) {
      const key = `${row[0]}  ${row[1]}${row[2] ? ` on ${row[2]}` : ""}`;
      if (!worst.has(key) || row[4] < worst.get(key)[4]) worst.set(key, row);
    }
    console.log(`\n${name}`);
    for (const [key, row] of worst) console.log(`  ${key.padEnd(40)} ${row[4].toFixed(2).padStart(6)}:1  (needs ${row[5]}, worst over ${row[3]})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--glass")) report();
  const failures = check();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("contrast ok");
}
