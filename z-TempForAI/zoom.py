"""把截图放大（最近邻），方便肉眼检查小字号 UI。

用法: python zoom.py src.png dst.png <倍数> [x y w h]
给了 x y w h 就先裁剪再放大。
"""
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
k = int(sys.argv[3]) if len(sys.argv) > 3 else 3
im = Image.open(src)
if len(sys.argv) > 7:
    x, y, w, h = (int(v) for v in sys.argv[4:8])
    im = im.crop((x, y, x + w, y + h))
im = im.resize((im.width * k, im.height * k), Image.NEAREST)
im.save(dst)
print(dst, im.size)
