## Preparing screenshots for the Obsidian community plugin page

The Obsidian community plugin page displays screenshots in a `3:2` preview card.
To avoid unexpected cropping, fit your screenshots into a `1200x800` canvas before uploading them.

This keeps the full screenshot visible and adds padding when the original image has a different aspect ratio.

### Requirements

Install ImageMagick first:

```bash
brew install imagemagick
```

### Convert screenshots

Run this command in the folder with your `.png` screenshots:

```bash
if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick is not installed. On macOS, install it with: brew install imagemagick"
  exit 1
fi

mkdir -p community-images

find . -maxdepth 1 -type f -name "*.png" | while read -r f; do
  filename="$(basename "$f")"

  magick "$f" \
    -resize 1200x800 \
    -background "#1e1e1e" \
    -gravity center \
    -extent 1200x800 \
    "community-images/${filename%.*}-1200x800.png"
done
```