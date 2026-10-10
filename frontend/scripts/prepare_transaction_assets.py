"""Crop public design artwork only from the two supplied transaction mockups."""
from pathlib import Path
import argparse
from PIL import Image, ImageFilter

parser = argparse.ArgumentParser()
parser.add_argument('--downloads', type=Path, default=Path.home() / 'Downloads')
args = parser.parse_args()
destination = Path(__file__).resolve().parents[1] / 'public' / 'assets' / 'transactions'
destination.mkdir(parents=True, exist_ok=True)
source = Image.open(args.downloads / '12th page.jpeg').convert('RGB')
source.crop((289, 351, 444, 430)).save(destination / 'agricultural-land.webp', quality=94)
# Help artwork is decorative public design, never a real identity/deed document.
source.crop((1426, 775, 1560, 888)).save(destination / 'document-help.webp', quality=94)
# Preserve the UI-free mountain/house behind the page heading. Reconstruct the
# remainder from quiet sky/sidebar areas, rather than serving a full-page UI image.
background = source.crop((850, 0, 1280, 78)).resize((1600, 900), Image.Resampling.LANCZOS)
house = source.crop((1035, 90, 1218, 206)).resize((360, 228), Image.Resampling.LANCZOS)
mask = Image.new('L', house.size)
for x in range(house.width):
    for y in range(house.height):
        edge = min(x, house.width - 1 - x, house.height - 1 - y)
        mask.putpixel((x, y), min(255, max(0, edge * 10)))
background.paste(house, (1005, 0), mask)
foreground = source.crop((2, 545, 230, 897)).resize((1600, 520), Image.Resampling.LANCZOS)
background.paste(foreground, (0, 380))
background = background.filter(ImageFilter.GaussianBlur(0.5))
background.save(destination / 'transaction-landscape.webp', quality=90)
print(f'Prepared three public design assets in {destination}')