"""Prepare account artwork; keep all uploaded originals unchanged. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[2]
destination = root / 'frontend' / 'public' / 'assets'
destination.mkdir(parents=True, exist_ok=True)
# Extract only scenic artwork from the supplied design, excluding text/form/footer.
scene = Image.open(root / '2nd page.png').convert('RGB').crop((0, 365, 970, 738))
scene = scene.resize((1600, 615), Image.Resampling.LANCZOS)
landscape = Image.new('RGB', (1600, 900), '#062c59')
landscape.paste(scene, (0, 285))
# Blend the scene's top edge into the navy sky without altering the original.
pixels = landscape.load()
for y in range(285, 365):
    blend = (y - 285) / 80
    for x in range(1600):
        r, g, b = pixels[x, y]
        pixels[x, y] = (int(6 + (r - 6) * blend), int(44 + (g - 44) * blend), int(89 + (b - 89) * blend))
landscape.save(destination / 'account-landscape.webp', quality=90)
ImageOps.mirror(landscape).save(destination / 'profile-landscape.webp', quality=90)
for source, target in [
    ('Cyan shield and padlock icon.png', 'privacy-shield.png'),
    ('Luminous cyan cloud upload icon.png', 'cloud-upload.png'),
]:
    image = Image.open(root / source).convert('RGBA')
    # Remove any near-black matte, including enclosed areas, preserving cyan glow.
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if max(r, g, b) < 35:
                pixels[x, y] = (r, g, b, 0)
    bounds = image.getbbox()
    if bounds:
        image = image.crop(bounds)
    image.thumbnail((256, 256), Image.Resampling.LANCZOS)
    image.save(destination / target, optimize=True)
    print(f'{target}: {image.size}')
