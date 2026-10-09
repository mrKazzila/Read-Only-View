# Image storage and preparation

## Choose the destination first

All paths below are relative to `docs/images/`.

| Directory | Purpose | Where it may be used |
|---|---|---|
| `documentation/` | Ready-to-use screenshots for documentation | Root `README.md` and `docs-site/` |
| `community-images/` | Publication-ready 1200×800 assets | Only the [Obsidian Community plugin page](https://community.obsidian.md/plugins/read-only-view) |
| `sources/screenshots/` | Original screenshots and retained legacy image/GIF sources | Input for preparing documentation or community assets |
| `sources/community/` | Original promotional banners | Input for preparing community assets |

Do not embed files from `community-images/` or `sources/` in the repository README or docs site. If the same image is needed in both channels, keep independent publication copies in `documentation/` and `community-images/`. A replacement for one channel must not silently change the other.

Keep only this instruction file at the images root. Avoid temporary directory names such as `new-community-images`, filename prefixes such as `new-`, and trailing version digits. Replace an outdated image under its stable name and update its matching source. Remove a source only after checking all consumers and preparation mappings. Existing community publication filenames stay stable because the external plugin page may reference them.

## Documentation images

`documentation/` currently contains these seven assets:

| File | Used by |
|---|---|
| `Read-Only-View-all-markdown-mode-1200x800.png` | Root README |
| `Read-Only-View-matched-paths-mode-1200x800.png` | Prepared settings screenshot; currently not embedded |
| `Read-Only-View-path-rules-1200x800.png` | Path rules |
| `Read-Only-View-path-tester-read-only-1200x800.png` | Root README and Path tester |
| `Read-Only-View-Context-menu.png` | Root README, docs homepage, and Lock and Unlock guide |
| `Read-Only-View-Explain-read-only-status.png` | Explain status guide |
| `Read-Only-View-Show-protection-indicators.png` | Protection indicators guide |

Crop screenshots to the relevant Obsidian window or settings area, removing the macOS menu bar, Dock, and desktop. Preserve legible text and use natural proportions. Documentation has no mandatory 1200×800 canvas; the four existing files with that suffix retain their previous dimensions and appearance.

Use ordinary Markdown image links in the root README and explicit Vue imports in docs-site Markdown. Give every embedded image descriptive alt text. Both must reference `documentation/`.

## Community image mapping

Keep exactly six publication files in `community-images/`: the standalone `Read-Only-View-1200x800.png` and the five banner outputs below. Do not add generated screenshot variants or other banners unless the publication set is explicitly changed. These outputs belong exclusively to the Obsidian Community plugin page. The 3:2 canvas prevents its preview card from cropping the interface unexpectedly. Banner originals retain their full resolution under `sources/community/`.

| Source | Output in `community-images/` |
|---|---|
| `sources/community/Flexible Protection Settings.png` | `Read-Only-View-flexible-protection-settings-banner-1200x800.png` |
| `sources/community/Obsidian Reading View Feature Banner.png` | `Read-Only-View-reading-view-banner-1200x800.png` |
| `sources/community/Read Comfortably on Mobile.png` | `Read-Only-View-mobile-reading-banner-1200x800.png` |
| `sources/community/See Why a Note Is Protected.png` | `Read-Only-View-explain-status-banner-1200x800.png` |
| `sources/community/Test Protection Rules Instantly.png` | `Read-Only-View-path-tester-banner-1200x800.png` |

The standalone `community-images/Read-Only-View-1200x800.png` is retained as a separate community asset and is not regenerated from this table. Retained sources, including `Obsidian Quick Action_ Lock Notes.png`, `Read-Only-View.png`, and `Read-Only-View-note-example.gif`, are not automatically published.

## Prepare community variants

ImageMagick and the separate PixScrub utility must be available:

```bash
magick -version
pixscrub --version
```

Run from `docs/images/`. For each row in the community mapping, resize its source proportionally and add centered padding; do not stretch or crop banner text:

```bash
make_community_image() {
  magick "$1" \
    -resize 1200x800 \
    -background "#1e1e1e" \
    -gravity center \
    -extent 1200x800 \
    "community-images/$2"
}

make_community_image \
  "sources/community/Obsidian Reading View Feature Banner.png" \
  "Read-Only-View-reading-view-banner-1200x800.png"
```

These commands update only community outputs. Prepare documentation copies separately when needed.

## Apply metadata with PixScrub

Use the following shared tags for prepared PNGs in either publication directory. Preserve the tags already attached to sources. The five refreshed screenshot sources (Advanced collapsed/open, context menu, status explanation, and protection indicators) and six banner sources also have these tags; other legacy sources are unchanged.

PixScrub writes to a separate output directory. Stage outside the repository, inspect the results, and then replace only the intended input files. Metadata does not determine an image's publication channel; its directory does.

```bash
tag_image() {
  pixscrub tag "$1" \
    --out "$2" \
    --tag "Title=Read Only View Obsidian plugin" \
    --tag "Description=Forces notes to open in read-only preview mode. Lock your files to prevent accidental edits with this simple editor lock tool. It works on both desktop and mobile using simple local rule matching with no extra runtime dependencies." \
    --tag "Author=mrKazzila - Ilya Kazakov" \
    --tag "Copyright=Copyright (C) 2025-2026 by Ilya Kazakov - mrKazzila. Licensed under 0BSD." \
    --tag "Keywords=Obsidian, plugin, read-only, Reading view, Markdown, notes" \
    --tag "Software=Obsidian"
}

image_stage="$(mktemp -d)"
tag_image "community-images/Read-Only-View-reading-view-banner-1200x800.png" "$image_stage"
pixscrub inspect "$image_stage" --json --out "$image_stage/inspection"
magick identify "$image_stage/Read-Only-View-reading-view-banner-1200x800.png"
```

Verify the six metadata fields and dimensions before copying the staged PNG over the corresponding publication file. Tagging must not change pixels. Keep reports, staging files, and backups outside the repository.

## Verify a change

1. Check image references in the root README and `docs-site/`: they must resolve to `documentation/`, never the community outputs or raw sources.
2. Confirm `community-images/` contains exactly the six approved files above and verify each is 1200×800. Documentation and source images keep their intended dimensions.
3. Inspect metadata after the last crop/resize operation and check the images visually.
4. Run `npm run docs:build` to check imports and the generated site. Check root README image paths separately, since VitePress does not build it.
5. Review references before deleting or renaming assets. Keep existing community URLs stable when replacing images used externally.
