"""Prepare public design crops only; never copies private property documents."""
from pathlib import Path
import argparse
from PIL import Image, ImageFilter

parser = argparse.ArgumentParser()
parser.add_argument('--downloads', type=Path, default=Path.home() / 'Downloads')
args = parser.parse_args()
destination = Path(__file__).resolve().parents[1] / 'public' / 'assets' / 'seller'
destination.mkdir(parents=True, exist_ok=True)
six = Image.open(args.downloads / '6th page.jpeg').convert('RGB')
seven = Image.open(args.downloads / '7th page.jpeg').convert('RGB')
six.crop((295, 253, 595, 343)).save(destination / 'residential-plot.webp', quality=92)
seven.crop((1038, 418, 1254, 533)).save(destination / 'coastal-plot.webp', quality=92)
seven.crop((1040, 720, 1180, 800)).save(destination / 'farm-plot.webp', quality=92)

# Reconstruct a decorative landscape from UI-free screenshot regions.
# No screenshot text/buttons are used as frontend UI.
sky = seven.crop((890, 0, 1240, 75)).resize((1600, 900), Image.Resampling.LANCZOS)
hills = seven.crop((0, 620, 242, 785)).resize((1600, 265), Image.Resampling.LANCZOS)
sky.paste(hills, (0, 530))
# Exclude the sidebar footer text at x < 250.
foreground = seven.crop((250, 863, 1600, 900)).resize((1600, 105), Image.Resampling.LANCZOS)
sky.paste(foreground, (0, 795))
for top, bottom in [(525, 540), (790, 805)]:
    region = sky.crop((0, top, 1600, bottom)).filter(ImageFilter.GaussianBlur(5))
    sky.paste(region, (0, top))
sky.save(destination / 'landscape.webp', quality=90)

for source, target in [('Cyan shield and padlock icon.png', 'shield-lock.webp'),
                       ('Luminous cyan cloud upload icon.png', 'cloud-upload.webp')]:
    image = Image.open(args.downloads / source).convert('RGBA')
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, alpha = pixels[x, y]
            if max(r, g, b) < 32:
                pixels[x, y] = (r, g, b, 0)
    bounds = image.getbbox()
    if bounds:
        image = image.crop(bounds)
    image.thumbnail((192, 192), Image.Resampling.LANCZOS)
    image.save(destination / target, quality=90)
print(f'Prepared six public-only seller assets in {destination}')