# Brand icons

The AmICited mark is three bars and a taller accent "citation" bar (`#5570FF`), taken from the
amicited.com header. On the production icon it sits on a near-black tile.

The three Icon Composer projects are the source of truth for full application icons:

- `dev/app-icon.icon`: blueprint background with dimension annotations, all-white bars
- `nightly/app-icon.icon`: night sky and clouds, white bars with the accent bar
- `prod/app-icon.icon`: black fill, white bars with the accent bar

Each project uses `text.svg` for the mark (the file name is upstream's) and `background.svg` when
the background is a vector layer. Additional layers use semantic names that describe their role
and placement. `prod/logo.svg` is a standalone copy of the production icon.

## Rendering on any OS

`node scripts/amicited/render-brand-icons.ts` rasterizes the three projects without Icon Composer
and writes every tracked PNG and ICO: iOS, macOS, Linux, Windows and web favicons, the development
copies in `apps/web/public`, and the Android
monochrome and notification silhouettes. The renders are flat (no Liquid Glass): layers are
composited at their `icon.json` scale and translation, then masked to Apple's rounded-square
shape. The macOS PNGs use the classic safe area: an 824×824 body inset 100px, with a soft shadow.

## Rendering with Icon Composer (macOS)

Run `vp run icons:export` from the repository root to regenerate the tracked iOS, Linux, Windows,
and web assets with Liquid Glass. The development web exports are also copied to `apps/web/public`
for the browser favicon and splash screen. Run `vp run icons:check` to verify that the generated
assets and public copies match their sources without changing files. Until someone runs this, the
check reports the flat renders above as stale.

Exporting requires Icon Composer 2 or newer on macOS. The script selects the newest compatible
exporter from Xcode or a standalone Icon Composer installation and pins design generation 26. Set
`ICON_COMPOSER_TOOL` to the full path of `Icon Composer.app/Contents/Executables/ictool` to
override automatic discovery.

Icon Composer's command-line exporter does not expose the `macOS pre-Tahoe` preset, so
`icons:export` leaves the tracked macOS PNGs unchanged. Export them from the Icon Composer app with
Platform `macOS pre-Tahoe`, Appearance `Default`, Size `1024pt`, Scale `1×`, and save them to:

- `dev/app-icon.icon` -> `dev/blueprint-macos-1024.png`
- `nightly/app-icon.icon` -> `nightly/nightly-macos-1024.png`
- `prod/app-icon.icon` -> `prod/black-macos-1024.png`

Each result must be a 1024×1024 PNG whose opaque body is 824×824, inset 100 pixels on every side,
with only Icon Composer's native shadow extending into the transparent canvas. Do not resize,
composite or otherwise post-process the exports, and do not edit generated PNG or ICO files
directly.

## Android launcher and splash artwork

Android masks the central 72dp of a 108dp adaptive canvas, and the Android 12+ splash screen masks
the central two thirds of a 288dp canvas, so the Icon Composer exports cannot be used directly:
their rounded-square silhouette gets framed again and the mark is cropped. The Android artwork is
instead rendered from the same Icon Composer SVG sources by `vp run icons:export:android`:

- `apps/mobile/assets/android-icon-foreground.png`: the shared transparent mark, sized to stay
  inside the safe zone
- `apps/mobile/assets/android-icon-background-dev.png` and `-nightly.png`: full-bleed variant
  artwork (blueprint grid and annotations; night sky and clouds). Production uses a solid color.
- `apps/mobile/assets/android-splash-icon-*.png`: the two layers composed into one 288dp image, so
  the splash mask reproduces the launcher icon's framing.

Rerun the export after changing a layer SVG. `android-icon-mark.png` (Android's monochrome themed
icon) and `android-notification-icon.png` are flat white silhouettes from
`scripts/amicited/render-brand-icons.ts`.
