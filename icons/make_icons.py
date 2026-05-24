from PIL import Image, ImageDraw, ImageFont

CJK_FONT  = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
BOLD_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
PINK = (217, 70, 239, 255)
WHITE = (255, 255, 255, 255)
BG = (24, 24, 27, 255)

def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([0, 0, size-1, size-1], fill=BG)

    sz_zh = int(size * 0.63)
    sz_a  = int(size * 0.78)
    font_a  = ImageFont.truetype(BOLD_FONT, sz_a)
    font_zh = ImageFont.truetype(CJK_FONT,  sz_zh)

    zh_x = int(size * 0.04)
    zh_y = int(size * 0.02)
    bb_zh = draw.textbbox((zh_x, zh_y), "说", font=font_zh)
    zh_w = bb_zh[2] - bb_zh[0]
    zh_h = bb_zh[3] - bb_zh[1]
    a_x = zh_x + zh_w // 2
    a_y = zh_y + zh_h // 2
    draw.text((zh_x, zh_y), "说", font=font_zh, fill=WHITE)
    draw.text((a_x, a_y), "A", font=font_a, fill=PINK)
    return img

for size in (128, 48, 16):
    make_icon(size).save(f"icon{size}.png")
    print(f"icon{size}.png")
