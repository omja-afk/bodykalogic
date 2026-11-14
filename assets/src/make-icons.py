"""Cut the tab icon out of the badge artwork.

The badge is the logo, so the tab icon is the badge — not a redraw of it. What
this does is choose the crop that survives being 16 or 32 pixels across: the
circular stamp alone, without the barbell plates that stick out either side.
Those plates read as grit at tab size and cost the disc the room it needs.

On a Retina screen Chrome draws a 16pt tab icon from the 32px image, which is
where "BODYKALOGIC" is still legible. The 16px entry is for everything else.

Run from the repo root:  python3 assets/src/make-icons.py
"""
from PIL import Image
import hashlib, os, pathlib

SRC = 'assets/src/badge-master.png'
OUT = 'assets'

im = Image.open(SRC).convert('RGB')
paper = im.getpixel((5, 5))
mask = im.convert('L').point(lambda v: 255 if v < 140 else 0)

# The disc: measured from a central vertical band, so the barbell is excluded.
cx = im.width // 2
band = mask.crop((cx - 200, 0, cx + 200, im.height)).getbbox()
top, bot = band[1], band[3]
r = (bot - top) // 2
ccy = (top + bot) // 2

pad = int(r * 0.04)
s = 2 * (r + pad)
square = Image.new('RGB', (s, s), paper)
square.paste(im.crop((cx - r - pad, ccy - r - pad, cx + r + pad, ccy + r + pad)), (0, 0))

ico_sizes = [16, 32, 48, 64]

# Save from the full-resolution crop, not from an already-small frame: PIL
# resizes whatever image it is handed, so saving the 16px one would upscale it
# back to 64 and every entry past the first would be a blur.
tmp = 'assets/.icon.tmp.ico'
square.save(tmp, format='ICO', sizes=[(n, n) for n in ico_sizes])
touch_tmp = 'assets/.icon-touch.tmp.png'
square.resize((180, 180), Image.LANCZOS).save(touch_tmp, format='PNG')


def rename_hashed(tmp_path, stem, ext):
    """Content-addressed filenames: a changed icon is a changed URL, so no cache
    anywhere can keep serving the previous one."""
    h = hashlib.sha1(pathlib.Path(tmp_path).read_bytes()).hexdigest()[:8]
    for old in pathlib.Path(OUT).glob(stem + '-*' + ext):
        old.unlink()
    final = os.path.join(OUT, '%s-%s%s' % (stem, h, ext))
    os.replace(tmp_path, final)
    return final


print(rename_hashed(tmp, 'icon', '.ico'))
print(rename_hashed(touch_tmp, 'icon-touch', '.png'))
