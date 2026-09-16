# Preparing screenshots

Keep the original screenshots in `docs/images/`. Put the publication-ready `1200x800` variants in `docs/images/community-images/` for the Obsidian community plugin page and README embeds.

The `3:2` canvas prevents the community preview card from cropping the interface unexpectedly. Original screenshots remain untagged; metadata is applied only to the seven community variants.

## Requirements

Install ImageMagick and make sure the separate `pixscrub` utility is available:

```bash
brew install imagemagick
magick -version
pixscrub --version
```

## Current screenshot mapping

| Source in `docs/images/` | Community output in `community-images/` |
|---|---|
| `Read-Only-View-advances-settings.png` | `Read-Only-View-advanced-collapsed-1200x800.png` |
| `Read-Only-View-advances-settings-open.png` | `Read-Only-View-advanced-open-1200x800.png` |
| `Read-Only-View-main-settings-All-markdown-files-mode.png` | `Read-Only-View-all-markdown-mode-1200x800.png` |
| `Read-Only-View-main-settings.png` | `Read-Only-View-matched-paths-mode-1200x800.png` |
| `Read-Only-View-path-rules.png` | `Read-Only-View-path-rules-1200x800.png` |
| `Read-Only-View-path-tester-editable-mode.png` | `Read-Only-View-path-tester-editable-1200x800.png` |
| `Read-Only-View-path-tester-read-mode.png` | `Read-Only-View-path-tester-read-only-1200x800.png` |

The source filenames keep their current `advances` spelling. Publication filenames normalize it to `advanced`.

## 1. Resize and extend

Run from `docs/images/`:

```bash
mkdir -p community-images

make_community_image() {
  input="$1"
  output="$2"

  magick "$input" \
    -resize 1200x800 \
    -background "#1e1e1e" \
    -gravity center \
    -extent 1200x800 \
    "community-images/$output"
}

make_community_image \
  "Read-Only-View-advances-settings.png" \
  "Read-Only-View-advanced-collapsed-1200x800.png"
make_community_image \
  "Read-Only-View-advances-settings-open.png" \
  "Read-Only-View-advanced-open-1200x800.png"
make_community_image \
  "Read-Only-View-main-settings-All-markdown-files-mode.png" \
  "Read-Only-View-all-markdown-mode-1200x800.png"
make_community_image \
  "Read-Only-View-path-rules.png" \
  "Read-Only-View-path-rules-1200x800.png"
make_community_image \
  "Read-Only-View-path-tester-editable-mode.png" \
  "Read-Only-View-path-tester-editable-1200x800.png"
make_community_image \
  "Read-Only-View-path-tester-read-mode.png" \
  "Read-Only-View-path-tester-read-only-1200x800.png"
```

The matched-paths screenshot needs a dedicated crop to remove the partial border of the next settings card before it is resized:

```bash
magick "Read-Only-View-main-settings.png" \
  -crop 1312x1215+0+0 +repage \
  -resize 1200x800 \
  -background "#1e1e1e" \
  -gravity center \
  -extent 1200x800 \
  "community-images/Read-Only-View-matched-paths-mode-1200x800.png"
```

## 2. Apply metadata

Use these values for all seven community PNGs:

- Title: `Read Only View Obsidian plugin`
- Description: `Forces notes to open in read-only preview mode. Lock your files to prevent accidental edits with this simple editor lock tool. It works on both desktop and mobile using simple local rule matching with no extra runtime dependencies.`
- Author: `mrKazzila - Ilya Kazakov`
- Copyright: `Copyright (C) 2025-2026 by Ilya Kazakov - mrKazzila. Licensed under 0BSD.`
- Keywords: `Obsidian, plugin, read-only, Reading view, Markdown, notes`
- Software: `Obsidian`

`pixscrub tag` writes to a separate directory. Tag only the seven mapped screenshots, inspect the staged results, and only then replace the untagged community variants. The unrelated `Read-Only-View-1200x800.png` asset is not part of this workflow.

```bash
tag_community_image() {
  pixscrub tag "community-images/$1" \
    --out community-images-tagged \
    --tag "Title=Read Only View Obsidian plugin" \
    --tag "Description=Forces notes to open in read-only preview mode. Lock your files to prevent accidental edits with this simple editor lock tool. It works on both desktop and mobile using simple local rule matching with no extra runtime dependencies." \
    --tag "Author=mrKazzila - Ilya Kazakov" \
    --tag "Copyright=Copyright (C) 2025-2026 by Ilya Kazakov - mrKazzila. Licensed under 0BSD." \
    --tag "Keywords=Obsidian, plugin, read-only, Reading view, Markdown, notes" \
    --tag "Software=Obsidian"
}

for image in \
  "Read-Only-View-advanced-collapsed-1200x800.png" \
  "Read-Only-View-advanced-open-1200x800.png" \
  "Read-Only-View-all-markdown-mode-1200x800.png" \
  "Read-Only-View-matched-paths-mode-1200x800.png" \
  "Read-Only-View-path-rules-1200x800.png" \
  "Read-Only-View-path-tester-editable-1200x800.png" \
  "Read-Only-View-path-tester-read-only-1200x800.png"
do
  tag_community_image "$image"
done
```

After verification, copy the seven staged PNGs from `community-images-tagged/` over their matching files in `community-images/`. Do not tag the source PNGs in `docs/images/`.

## 3. Verify output

Confirm dimensions and inspect the embedded metadata before publishing:

```bash
identify community-images-tagged/*.png
pixscrub inspect community-images-tagged --json
```

Every output must report `1200x800`, use its mapped filename, and contain the metadata values above. The required order is: crop when needed, resize/extend, apply metadata, then verify dimensions and tags.
