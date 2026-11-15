// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Standalone image script; no Effect runtime.
// Renders the flat icon set from the Icon Composer projects on any OS. On macOS,
// `vp run icons:export` replaces the iOS, web and Windows outputs with Liquid Glass renders.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import sharp from "sharp";

import { BRAND_ASSET_PATHS, DEVELOPMENT_PUBLIC_ICON_OVERRIDES } from "../lib/brand-assets.ts";
import { encodePngIco, WINDOWS_ICON_SIZES } from "../lib/icon-export.ts";

const ROOT = NodePath.resolve(import.meta.dirname, "../..");
const CANVAS = 1024;
const MAC_BODY = 824;
const MAC_INSET = (CANVAS - MAC_BODY) / 2;

interface Layer {
  readonly "image-name": string;
  readonly hidden?: boolean;
  readonly opacity?: number;
  readonly position?: {
    readonly scale: number;
    readonly "translation-in-points": [number, number];
  };
}
interface IconProject {
  readonly fill?: { readonly solid?: string; readonly "automatic-gradient"?: string };
  readonly groups: ReadonlyArray<{ readonly layers: ReadonlyArray<Layer> }>;
}

const VARIANTS = [
  {
    source: BRAND_ASSET_PATHS.developmentIconComposerProject,
    ios: [BRAND_ASSET_PATHS.developmentIosIconPng, BRAND_ASSET_PATHS.developmentUniversalIconPng],
    macos: BRAND_ASSET_PATHS.developmentDesktopIconPng,
    appleTouch: BRAND_ASSET_PATHS.developmentWebAppleTouchIconPng,
    favicon16: BRAND_ASSET_PATHS.developmentWebFavicon16Png,
    favicon32: BRAND_ASSET_PATHS.developmentWebFavicon32Png,
    ico: [BRAND_ASSET_PATHS.developmentWebFaviconIco, BRAND_ASSET_PATHS.developmentWindowsIconIco],
  },
  {
    source: BRAND_ASSET_PATHS.nightlyIconComposerProject,
    ios: [BRAND_ASSET_PATHS.nightlyIosIconPng, BRAND_ASSET_PATHS.nightlyLinuxIconPng],
    macos: BRAND_ASSET_PATHS.nightlyMacIconPng,
    appleTouch: BRAND_ASSET_PATHS.nightlyWebAppleTouchIconPng,
    favicon16: BRAND_ASSET_PATHS.nightlyWebFavicon16Png,
    favicon32: BRAND_ASSET_PATHS.nightlyWebFavicon32Png,
    ico: [BRAND_ASSET_PATHS.nightlyWebFaviconIco, BRAND_ASSET_PATHS.nightlyWindowsIconIco],
  },
  {
    source: BRAND_ASSET_PATHS.productionIconComposerProject,
    ios: [BRAND_ASSET_PATHS.productionIosIconPng, BRAND_ASSET_PATHS.productionLinuxIconPng],
    macos: BRAND_ASSET_PATHS.productionMacIconPng,
    appleTouch: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
    favicon16: BRAND_ASSET_PATHS.productionWebFavicon16Png,
    favicon32: BRAND_ASSET_PATHS.productionWebFavicon32Png,
    ico: [BRAND_ASSET_PATHS.productionWebFaviconIco, BRAND_ASSET_PATHS.productionWindowsIconIco],
  },
] as const;

// Apple's continuous-corner icon shape, approximated by a superellipse.
const squircleSvg = (size: number, canvas = size, offset = { x: 0, y: 0 }, opacity = 1) => {
  const half = size / 2;
  const points: Array<string> = [];
  for (let i = 0; i < 360; i += 1) {
    const t = (i / 360) * 2 * Math.PI;
    const x = Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** (2 / 5);
    const y = Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** (2 / 5);
    points.push(
      `${(offset.x + half + x * half).toFixed(2)},${(offset.y + half + y * half).toFixed(2)}`,
    );
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}"><polygon points="${points.join(" ")}" fill-opacity="${opacity}"/></svg>`,
  );
};

const p3ToHex = (value: string) => {
  const [r, g, b] = value
    .replace(/^display-p3:/, "")
    .split(",")
    .map(Number);
  return `#${[r, g, b]
    .map((c) =>
      Math.round((c ?? 0) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

const svgSize = (svg: string) => ({
  width: Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1] ?? 128),
  height: Number(/<svg[^>]*\sheight="([\d.]+)"/.exec(svg)?.[1] ?? 128),
});

async function renderLayer(file: string, layer: Layer) {
  const svg = await NodeFSP.readFile(file, "utf8");
  const size = svgSize(svg);
  const scale = layer.position?.scale ?? 1;
  const [tx, ty] = layer.position?.["translation-in-points"] ?? [0, 0];
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  const left = Math.round(CANVAS / 2 + tx - width / 2);
  const top = Math.round(CANVAS / 2 + ty - height / 2);
  let png = await sharp(Buffer.from(svg), { density: (72 * width) / size.width })
    .resize(width, height)
    .png()
    .toBuffer();
  if (layer.opacity !== undefined && layer.opacity < 1) {
    png = await sharp(png)
      .composite([
        {
          input: Buffer.from([0, 0, 0, Math.round(layer.opacity * 255)]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();
  }
  // Crop to the canvas; sharp rejects overlays that extend past the base image.
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(CANVAS, left + width);
  const y1 = Math.min(CANVAS, top + height);
  const input = await sharp(png)
    .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
    .png()
    .toBuffer();
  return { input, left: x0, top: y0 };
}

async function renderFullBleed(projectDir: string) {
  const project = JSON.parse(
    await NodeFSP.readFile(NodePath.join(projectDir, "icon.json"), "utf8"),
  ) as IconProject;
  const fill = project.fill?.solid ?? project.fill?.["automatic-gradient"] ?? "display-p3:0,0,0,1";
  // Icon Composer lists layers top first.
  const layers = project.groups.flatMap((group) => group.layers).toReversed();
  const overlays = await Promise.all(
    layers
      .filter((layer) => !layer.hidden)
      .map((layer) => renderLayer(NodePath.join(projectDir, "Assets", layer["image-name"]), layer)),
  );
  return sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: p3ToHex(fill) },
  })
    .composite(overlays)
    .png()
    .toBuffer();
}

const maskToSquircle = (image: Buffer, size: number) =>
  sharp(image)
    .resize(size, size)
    .composite([{ input: squircleSvg(size), blend: "dest-in" }])
    .png()
    .toBuffer();

async function renderMacos(fullBleed: Buffer) {
  const body = await maskToSquircle(fullBleed, MAC_BODY);
  const shadow = await sharp(
    squircleSvg(MAC_BODY, CANVAS, { x: MAC_INSET, y: MAC_INSET + 10 }, 0.35),
  )
    .blur(14)
    .png()
    .toBuffer();
  return sharp(shadow)
    .composite([{ input: body, left: MAC_INSET, top: MAC_INSET }])
    .png()
    .toBuffer();
}

const resize = (image: Buffer, size: number) =>
  sharp(image).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();

async function write(relativePath: string, contents: Buffer) {
  const target = NodePath.join(ROOT, relativePath);
  await NodeFSP.mkdir(NodePath.dirname(target), { recursive: true });
  await NodeFSP.writeFile(target, contents);
  console.log(`wrote ${relativePath}`);
}

// Flat white silhouette of the mark for Android's monochrome and notification icons.
async function renderSilhouette(size: number, widthFraction: number) {
  const text = await NodeFSP.readFile(
    NodePath.join(ROOT, BRAND_ASSET_PATHS.productionIconComposerProject, "Assets", "text.svg"),
    "utf8",
  );
  const paths = (text.match(/<path[^>]*\/>/g) ?? []).map((path) =>
    path.replace(/fill="[^"]*"/, 'fill="white"'),
  );
  const mark = { x: 29.98, y: 37, width: 68.04, height: 54 };
  const scale = (size * widthFraction) / mark.width;
  const tx = (size - mark.width * scale) / 2 - mark.x * scale;
  const ty = (size - mark.height * scale) / 2 - mark.y * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><g transform="translate(${tx} ${ty}) scale(${scale})">${paths.join("")}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

for (const variant of VARIANTS) {
  const fullBleed = await renderFullBleed(NodePath.join(ROOT, variant.source));
  const ios = await maskToSquircle(fullBleed, CANVAS);
  for (const path of variant.ios) await write(path, ios);
  const macos = await renderMacos(fullBleed);
  await write(variant.macos, macos);
  const appleTouch = await resize(ios, 180);
  const favicon16 = await resize(ios, 16);
  const favicon32 = await resize(ios, 32);
  await write(variant.appleTouch, appleTouch);
  await write(variant.favicon16, favicon16);
  await write(variant.favicon32, favicon32);
  const ico = encodePngIco(
    await Promise.all(
      WINDOWS_ICON_SIZES.map(async (size) => ({ size, contents: await resize(ios, size) })),
    ),
  );
  for (const path of variant.ico) await write(path, ico);
}

for (const override of DEVELOPMENT_PUBLIC_ICON_OVERRIDES) {
  await write(
    override.targetRelativePath,
    await NodeFSP.readFile(NodePath.join(ROOT, override.sourceRelativePath)),
  );
}

await write("apps/mobile/assets/android-icon-mark.png", await renderSilhouette(432, 0.5));
await write("apps/mobile/assets/android-notification-icon.png", await renderSilhouette(96, 0.66));
