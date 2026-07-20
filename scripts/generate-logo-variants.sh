#!/usr/bin/env bash

# Derive every distribution variant from the single generated master.
# This script never calls an image-generation model.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source="$root/src/client/assets/canvas-logo.png"
output="$root/src/client/public/brand"

if [[ ! -f "$source" ]]; then
	printf 'Missing logo master: %s\n' "$source" >&2
	exit 1
fi

command -v sips >/dev/null || {
	printf 'sips is required to generate logo variants.\n' >&2
	exit 1
}
command -v ffmpeg >/dev/null || {
	printf 'ffmpeg is required to generate logo variants.\n' >&2
	exit 1
}

mkdir -p "$output"

for size in 512 192 180 64; do
	sips -z "$size" "$size" "$source" --out "$output/canvas-logo-${size}.png" >/dev/null
done

# App-icon versions have a solid field so they remain legible in launchers.
ffmpeg -y -f lavfi -i 'color=c=#04040c:s=1024x1024' -i "$source" \
	-filter_complex '[0:v][1:v]overlay=(W-w)/2:(H-h)/2:format=auto' -frames:v 1 -update 1 \
	"$output/canvas-logo-dark.png" >/dev/null 2>&1
ffmpeg -y -f lavfi -i 'color=c=#eef1ff:s=1024x1024' -i "$source" \
	-filter_complex '[0:v][1:v]overlay=(W-w)/2:(H-h)/2:format=auto' -frames:v 1 -update 1 \
	"$output/canvas-logo-light.png" >/dev/null 2>&1

sips -z 64 64 -s format ico "$source" --out "$root/src/client/public/favicon.ico" >/dev/null
