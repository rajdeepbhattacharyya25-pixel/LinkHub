#!/usr/bin/env python3
"""
Generate the 1200x630 LinkedIn/GitHub-style OpenGraph share card (public/og-share-card.jpg)
for Rajdeep Bhattacharyya's Link Hub using his live banner, circular avatar, and pen signature.

Usage:
  python scripts/generate_og_card.py
"""
from __future__ import annotations

import io
import json
import os
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "public" / "og-share-card.jpg"
SIGNATURE_PATH = ROOT / "src" / "assets" / "images" / "rajdeep_signature.png"
FIREBASE_CFG_PATH = ROOT / "firebase-applet-config.json"

W, H = 1200, 630

# Pantone 19-1118 TCX Espresso Truffle & Champagne Cotton Paper palette
CANVAS_BG = (74, 51, 36)       # #4A3324
CANVAS_DARK = (54, 36, 25)     # #362419
CARD_BG = (244, 237, 226)      # #F4EDE2
INNER_BG = (250, 246, 240)     # #FAF6F0
INK_DARK = (26, 18, 14)        # #1A120E
INK_ESPRESSO = (58, 36, 24)    # #3A2418
ACCENT_COPPER = (107, 74, 46)  # #6B4A2E
MUTED_BROWN = (82, 65, 53)     # #524135
BORDER_SAND = (213, 196, 174)  # #D5C4AE
RING_COPPER = (184, 155, 126)  # #B89B7E


def load_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_dirs = [Path("C:/Windows/Fonts"), Path("/usr/share/fonts/truetype/dejavu")]
    for name in candidates:
        for d in font_dirs:
            p = d / name
            if p.exists():
                return ImageFont.truetype(str(p), size=size)
    return ImageFont.load_default()


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "LinkHubOGGenerator/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()


def load_live_profile_media() -> tuple[Image.Image, Image.Image, dict]:
    cfg = json.loads(FIREBASE_CFG_PATH.read_text(encoding="utf-8"))
    base_fs = (
        f"https://firestore.googleapis.com/v1/projects/{cfg['projectId']}"
        f"/databases/{cfg['firestoreDatabaseId']}/documents/hub/public?key={cfg['apiKey']}"
    )
    hub_doc = json.loads(fetch_bytes(base_fs).decode("utf-8"))
    pf = hub_doc.get("fields", {}).get("profile", {}).get("mapValue", {}).get("fields", {})

    def sval(key: str, default: str = "") -> str:
        return str(pf.get(key, {}).get("stringValue", default) or default).strip()

    avatar_rel = sval("avatarUrl")
    banner_rel = sval("bannerImageUrl")
    origin = "https://rajdeepbhattacharyya-linkhub.vercel.app"

    avatar_url = avatar_rel if avatar_rel.startswith("http") else f"{origin}{avatar_rel}"
    banner_url = banner_rel if banner_rel.startswith("http") else f"{origin}{banner_rel}"

    avatar_img = Image.open(io.BytesIO(fetch_bytes(avatar_url))).convert("RGBA")
    banner_img = Image.open(io.BytesIO(fetch_bytes(banner_url))).convert("RGBA")

    meta = {
        "fullName": sval("fullName", "Rajdeep Bhattacharyya"),
        "handle": sval("handle", "@_rajdeep.007_"),
        "role": sval("role", "IT Student · SaaS & Product Builder"),
        "location": sval("location", "Kolkata"),
    }
    return avatar_img, banner_img, meta


def cover_crop(img: Image.Image, target_w: int, target_h: int, align_y: float = 0.5) -> Image.Image:
    src_w, src_h = img.size
    scale = max(target_w / src_w, target_h / src_h)
    new_w = int(round(src_w * scale))
    new_h = int(round(src_h * scale))
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = max(0, (new_w - target_w) // 2)
    top = max(0, int(round((new_h - target_h) * align_y)))
    return resized.crop((left, top, left + target_w, top + target_h))


def make_rounded_mask(size: tuple[int, int], radius: int, scale: int = 4) -> Image.Image:
    sw, sh = size[0] * scale, size[1] * scale
    mask = Image.new("L", (sw, sh), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, sw - 1, sh - 1], radius=radius * scale, fill=255)
    return mask.resize(size, Image.Resampling.LANCZOS)


def make_circle_avatar(avatar: Image.Image, diameter: int, ring_px: int = 7) -> Image.Image:
    scale = 4
    total_d = diameter + ring_px * 2 + 24
    out = Image.new("RGBA", (total_d, total_d), (0, 0, 0, 0))

    # Soft drop shadow
    shadow = Image.new("RGBA", (total_d, total_d), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    pad = 12
    sd.ellipse(
        [pad, pad + 5, pad + diameter + ring_px * 2, pad + diameter + ring_px * 2 + 5],
        fill=(26, 18, 14, 95),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=8))
    out.alpha_composite(shadow)

    # Outer champagne ring + subtle copper hairline (4x supersampled)
    ring_hi = Image.new("RGBA", (total_d * scale, total_d * scale), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring_hi)
    x0 = pad * scale
    y0 = pad * scale
    x1 = (pad + diameter + ring_px * 2) * scale
    y1 = (pad + diameter + ring_px * 2) * scale
    rd.ellipse([x0, y0, x1, y1], fill=(*CARD_BG, 255), outline=(*RING_COPPER, 255), width=2 * scale)
    ring_lo = ring_hi.resize((total_d, total_d), Image.Resampling.LANCZOS)
    out.alpha_composite(ring_lo)

    # Circular avatar photo
    cropped = cover_crop(avatar, diameter, diameter, align_y=0.25)
    circ_mask_hi = Image.new("L", (diameter * scale, diameter * scale), 0)
    ImageDraw.Draw(circ_mask_hi).ellipse(
        [0, 0, diameter * scale - 1, diameter * scale - 1], fill=255
    )
    circ_mask = circ_mask_hi.resize((diameter, diameter), Image.Resampling.LANCZOS)
    cropped.putalpha(circ_mask)
    out.paste(cropped, (pad + ring_px, pad + ring_px), cropped)
    return out


def extract_signature(path: Path, tint_rgb: tuple[int, int, int], max_w: int, max_h: int) -> Image.Image | None:
    if not path.exists():
        return None
    src = Image.open(path).convert("RGBA")
    # Downscale first for speed & clean anti-aliasing
    src.thumbnail((900, 900), Image.Resampling.LANCZOS)
    w, h = src.size
    px = src.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = out.load()

    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # Magenta pen ink stands out strongly on (r + b)/2 - g and (r - g)
            magenta = ((r + b) * 0.5) - g
            red_bias = r - g
            score = max(magenta, red_bias * 0.85)
            if score > 22:
                alpha = min(255, int((score - 22) * 5.2))
                if alpha > 24:
                    opx[x, y] = (tint_rgb[0], tint_rgb[1], tint_rgb[2], int(alpha * 0.88))
                    if x < min_x:
                        min_x = x
                    if y < min_y:
                        min_y = y
                    if x > max_x:
                        max_x = x
                    if y > max_y:
                        max_y = y

    if max_x <= min_x or max_y <= min_y:
        return None

    pad = 8
    cropped = out.crop((max(0, min_x - pad), max(0, min_y - pad), min(w, max_x + pad), min(h, max_y + pad)))
    cropped.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    return cropped


def draw_verified_badge(canvas: Image.Image, x: int, y: int, size: int = 30) -> None:
    scale = 4
    s = size * scale
    badge = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(badge)
    d.ellipse([0, 0, s - 1, s - 1], fill=(*INK_ESPRESSO, 255))
    # Crisp white checkmark
    pts = [
        (int(s * 0.28), int(s * 0.52)),
        (int(s * 0.44), int(s * 0.68)),
        (int(s * 0.73), int(s * 0.34)),
    ]
    d.line(pts, fill=(*INNER_BG, 255), width=max(2, int(s * 0.11)), joint="curve")
    lo = badge.resize((size, size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(lo, (x, y))


def build_og_card() -> None:
    avatar_img, banner_img, meta = load_live_profile_media()

    # 1. Warm Espresso Truffle canvas with subtle gradient depth
    canvas = Image.new("RGBA", (W, H), (*CANVAS_BG, 255))
    bg_draw = ImageDraw.Draw(canvas)
    for y in range(H):
        t = y / (H - 1)
        r = int(CANVAS_BG[0] * (1 - t * 0.22) + CANVAS_DARK[0] * (t * 0.22))
        g = int(CANVAS_BG[1] * (1 - t * 0.22) + CANVAS_DARK[1] * (t * 0.22))
        b = int(CANVAS_BG[2] * (1 - t * 0.22) + CANVAS_DARK[2] * (t * 0.22))
        bg_draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

    # Subtle diagonal micro-texture dots
    for y in range(12, H, 28):
        for x in range(12, W, 28):
            bg_draw.point((x, y), fill=(250, 246, 240, 22))

    # 2. Inner LinkedIn/GitHub-style rounded profile card
    margin_x, margin_y = 26, 24
    card_w, card_h = W - margin_x * 2, H - margin_y * 2
    card_r = 28

    # Card drop shadow
    card_shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(card_shadow).rounded_rectangle(
        [margin_x, margin_y + 8, margin_x + card_w, margin_y + card_h + 8],
        radius=card_r,
        fill=(18, 11, 8, 120),
    )
    card_shadow = card_shadow.filter(ImageFilter.GaussianBlur(radius=14))
    canvas.alpha_composite(card_shadow)

    card = Image.new("RGBA", (card_w, card_h), (*CARD_BG, 255))
    banner_h = 308

    # Top banner (cover-cropped cleanly)
    fitted_banner = cover_crop(banner_img, card_w, banner_h, align_y=0.5)
    card.paste(fitted_banner, (0, 0))

    # Subtle bottom edge scrim on banner for smooth seam transition
    scrim = Image.new("RGBA", (card_w, 34), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    for i in range(34):
        alpha = int((i / 33) * 70)
        sd.line([(0, i), (card_w, i)], fill=(18, 14, 12, alpha))
    card.alpha_composite(scrim, (0, banner_h - 34))

    # Hairline divider between banner & champagne paper
    cdraw = ImageDraw.Draw(card)
    cdraw.line([(0, banner_h), (card_w, banner_h)], fill=(*BORDER_SAND, 255), width=2)

    # Mask card to rounded corners & composite onto canvas
    card_mask = make_rounded_mask((card_w, card_h), radius=card_r)
    card.putalpha(card_mask)
    canvas.alpha_composite(card, (margin_x, margin_y))

    # Crisp outer card hairline border
    border_hi = Image.new("RGBA", (W * 2, H * 2), (0, 0, 0, 0))
    ImageDraw.Draw(border_hi).rounded_rectangle(
        [margin_x * 2, margin_y * 2, (margin_x + card_w) * 2, (margin_y + card_h) * 2],
        radius=card_r * 2,
        outline=(*BORDER_SAND, 220),
        width=3,
    )
    canvas.alpha_composite(border_hi.resize((W, H), Image.Resampling.LANCZOS))

    # 3. Overlapping circular Profile Photo (straddling banner & champagne paper)
    avatar_d = 172
    avatar_badge = make_circle_avatar(avatar_img, diameter=avatar_d, ring_px=7)
    avatar_x = margin_x + 34
    avatar_y = margin_y + banner_h - 92
    canvas.alpha_composite(avatar_badge, (avatar_x, avatar_y))

    # 4. Typography (clean hierarchy right next to avatar)
    font_name = load_font(["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"], 42)
    font_role = load_font(["segoeuisl.ttf", "segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"], 23)
    font_pill = load_font(["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"], 15)
    font_mono = load_font(["consolab.ttf", "consola.ttf", "DejaVuSansMono-Bold.ttf"], 16)

    draw = ImageDraw.Draw(canvas)
    text_x = margin_x + 256
    name_y = margin_y + banner_h + 22

    full_name = meta["fullName"]
    draw.text((text_x, name_y), full_name, font=font_name, fill=(*INK_DARK, 255))
    name_bbox = draw.textbbox((text_x, name_y), full_name, font=font_name)
    badge_x = name_bbox[2] + 14
    badge_y = name_y + 11
    draw_verified_badge(canvas, badge_x, badge_y, size=30)

    # Role + Location
    role_line = meta["role"]
    if meta["location"]:
        role_line = f"{role_line}  ·  {meta['location']}, India"
    role_y = name_y + 56
    draw.text((text_x, role_y), role_line, font=font_role, fill=(*ACCENT_COPPER, 255))

    # Skill pills
    pills = ["React & TypeScript", "AI & Gemini", "ESP32 & Hardware", "SaaS Builder"]
    pill_x = text_x
    pill_y = role_y + 42
    for label in pills:
        tb = draw.textbbox((0, 0), label, font=font_pill)
        pw = (tb[2] - tb[0]) + 28
        ph = 32
        draw.rounded_rectangle(
            [pill_x, pill_y, pill_x + pw, pill_y + ph],
            radius=16,
            fill=(*INNER_BG, 255),
            outline=(*BORDER_SAND, 255),
            width=1,
        )
        draw.text((pill_x + 14, pill_y + 6), label, font=font_pill, fill=(*INK_ESPRESSO, 255))
        pill_x += pw + 10

    # 5. Signature accent stamp on bottom right
    sig = extract_signature(SIGNATURE_PATH, tint_rgb=INK_ESPRESSO, max_w=195, max_h=128)
    if sig is not None:
        sig_x = margin_x + card_w - sig.width - 34
        sig_y = margin_y + banner_h + 24
        canvas.alpha_composite(sig, (sig_x, sig_y))

    # 6. Bottom URL & Handle metadata strip
    footer_line_y = margin_y + card_h - 56
    draw.line(
        [(margin_x + 36, footer_line_y), (margin_x + card_w - 36, footer_line_y)],
        fill=(*BORDER_SAND, 210),
        width=1,
    )
    footer_left = f"{meta['handle']}   ·   rajdeepbhattacharyya-linkhub.vercel.app/RajdeepBhattacharyya-LinkHub"
    draw.text(
        (margin_x + 38, footer_line_y + 17),
        footer_left,
        font=font_mono,
        fill=(*MUTED_BROWN, 255),
    )

    pantone_label = "LINK HUB"
    pb = draw.textbbox((0, 0), pantone_label, font=font_mono)
    pw = (pb[2] - pb[0]) + 24
    px = margin_x + card_w - 36 - pw
    py = footer_line_y + 12
    draw.rounded_rectangle(
        [px, py, px + pw, py + 28],
        radius=14,
        fill=(*INK_ESPRESSO, 255),
    )
    draw.text((px + 12, py + 5), pantone_label, font=font_mono, fill=(*INNER_BG, 255))

    # 7. Save crisp progressive JPEG under 200 KB (well under WhatsApp's 300 KB cap)
    final_rgb = canvas.convert("RGB")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    for q in (88, 84, 80, 76):
        buf = io.BytesIO()
        final_rgb.save(buf, format="JPEG", quality=q, optimize=True, progressive=True)
        if buf.tell() <= 200_000 or q == 76:
            OUT_PATH.write_bytes(buf.getvalue())
            print(f"Generated {OUT_PATH} ({W}x{H}, quality={q}, size={buf.tell():,} bytes)")
            break


if __name__ == "__main__":
    build_og_card()
