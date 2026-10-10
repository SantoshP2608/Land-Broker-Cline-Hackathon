"""Prepare uploaded homepage artwork without altering the user's originals."""
from collections import deque
from pathlib import Path
from shutil import copyfile
from PIL import Image

root = Path(__file__).resolve().parents[2]
destination = root / 'frontend' / 'public' / 'assets'
destination.mkdir(parents=True, exist_ok=True)
copyfile(root / 'main-hero.png', destination / 'Main-hero.png')

for name in ['assurance.png', 'ai-verf.png', 'doc-search.png', 'human-shield.png']:
    image = Image.open(root / name).convert('RGBA')
    pixels = image.load()
    width, height = image.size
    visited = bytearray(width * height)
    queue = deque()

    def background(x, y):
        r, g, b, _ = pixels[x, y]
        if name == 'ai-verf.png':
            # The uploaded checkerboard is RGB, not real transparency.
            return max(r, g, b) - min(r, g, b) < 24 and max(r, g, b) < 225
        return max(r, g, b) < 34

    def enqueue(x, y):
        index = y * width + x
        if not visited[index] and background(x, y):
            visited[index] = 1
            queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)
    while queue:
        x, y = queue.popleft()
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
        for nx, ny in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]:
            if 0 <= nx < width and 0 <= ny < height:
                enqueue(nx, ny)

    bounds = image.getbbox()
    if bounds:
        image = image.crop(bounds)
    # Compact, sharp assets for 64px display including high-density screens.
    image.thumbnail((256, 256), Image.Resampling.LANCZOS)
    image.save(destination / name, optimize=True)
    print(f'{name}: {image.size}, transparent background prepared')
