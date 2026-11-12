from collections import deque
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageFilter

SPECIES_MAP = [
    ("1.png", "dolphin", "海豚"),
    ("2.png", "jellyfish", "水母"),
    ("3.png", "squid", "烏賊"),
    ("4.png", "turtle", "海龜"),
    ("5.png", "crab", "螃蟹"),
    ("6.png", "clownfish", "小丑魚"),
]

CANONICAL_SIZE = 384
PRINT_SIZE = 1024
INNER_PADDING_RATIO = 0.08  # keep 8% margin inside canonical frame


def smooth_line_art(src_path: Path, target_size: int, margin_ratio: float) -> Image.Image:
    gray = Image.open(src_path).convert("L")
    arr = np.array(gray)
    # Find tight bounding box of dark ink
    ink = arr < 220
    ys, xs = np.where(ink)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    cropped = gray.crop((x0, y0, x1, y1))

    # Scale into target box with margin
    avail = int(target_size * (1 - 2 * margin_ratio))
    cw, ch = cropped.size
    scale = min(avail / cw, avail / ch)
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))

    # Upscale 2x first for anti-aliased smoothing, blur, contrast-tighten, then downsample
    hi_w, hi_h = nw * 2, nh * 2
    hi = cropped.resize((hi_w, hi_h), Image.Resampling.LANCZOS)
    hi = hi.filter(ImageFilter.GaussianBlur(radius=1.6))
    hi_arr = np.array(hi, dtype=np.float32)
    # Smoothstep contrast sharpening around midpoint 168
    t = np.clip((hi_arr - 130.0) / (205.0 - 130.0), 0.0, 1.0)
    t = t * t * (3.0 - 2.0 * t)
    sharp = (t * 255.0).astype(np.uint8)
    smooth = Image.fromarray(sharp, mode="L").resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("L", (target_size, target_size), 255)
    ox = (target_size - nw) // 2
    oy = (target_size - nh) // 2
    canvas.paste(smooth, (ox, oy))
    return canvas


def compute_mask_and_outline(gray_img: Image.Image) -> tuple[np.ndarray, np.ndarray, tuple[int, int, int, int]]:
    arr = np.array(gray_img, dtype=np.uint8)
    h, w = arr.shape
    # Line barrier for flood fill (solid dark pixels)
    barrier = arr < 170
    vis = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        if not barrier[0, x]:
            vis[0, x] = True
            q.append((0, x))
        if not barrier[h - 1, x]:
            vis[h - 1, x] = True
            q.append((h - 1, x))
    for y in range(h):
        if not barrier[y, 0]:
            vis[y, 0] = True
            q.append((y, 0))
        if not barrier[y, w - 1]:
            vis[y, w - 1] = True
            q.append((y, w - 1))

    while q:
        cy, cx = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not vis[ny, nx] and not barrier[ny, nx]:
                vis[ny, nx] = True
                q.append((ny, nx))

    interior = ~vis
    # Dilate mask by 1px so outer anti-aliased edge of black outline & crab open-stroke legs are cleanly kept
    mask_img = Image.fromarray((interior.astype(np.uint8) * 255), mode="L")
    mask_dilated = mask_img.filter(ImageFilter.MaxFilter(size=3))
    mask_arr = (np.array(mask_dilated) > 127).astype(np.uint8)

    # Outline alpha (0..255) only where dark line exists; white interior has alpha 0
    outline_alpha = np.clip(255 - arr.astype(np.int32), 0, 255).astype(np.uint8)
    outline_alpha[outline_alpha < 18] = 0

    ys, xs = np.where(mask_arr > 0)
    pad = 4
    bx0 = max(0, int(xs.min()) - pad)
    by0 = max(0, int(ys.min()) - pad)
    bx1 = min(w, int(xs.max()) + 1 + pad)
    by1 = min(h, int(ys.max()) + 1 + pad)

    return mask_arr, outline_alpha, (bx0, by0, bx1 - bx0, by1 - by0)


def encode_rle(values: np.ndarray) -> list[int]:
    flat = values.ravel().tolist()
    if not flat:
        return []
    out: list[int] = []
    cur = int(flat[0])
    count = 1
    for v in flat[1:]:
        iv = int(v)
        if iv == cur:
            count += 1
        else:
            out.append(cur)
            out.append(count)
            cur = iv
            count = 1
    out.append(cur)
    out.append(count)
    return out


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    out_dir = root / "public" / "templates"
    out_dir.mkdir(parents=True, exist_ok=True)
    debug_dir = root / "scripts" / "generated"
    debug_dir.mkdir(parents=True, exist_ok=True)
    ts_data_dir = root / "src" / "domain" / "generated"
    ts_data_dir.mkdir(parents=True, exist_ok=True)

    species_masks = {}

    for src_name, species_id, label in SPECIES_MAP:
        src_path = root / src_name
        # 1. Canonical 384x384 for CV alignment & runtime texture extraction
        canon_gray = smooth_line_art(src_path, CANONICAL_SIZE, INNER_PADDING_RATIO)
        mask_arr, outline_alpha, crop_rect = compute_mask_and_outline(canon_gray)

        interior_ratio = float(mask_arr.mean())
        print(f"{species_id} ({label}): interior_ratio={interior_ratio:.3f}, cropRect={crop_rect}")
        assert 0.10 < interior_ratio < 0.70, f"Unexpected mask ratio for {species_id}: {interior_ratio}"

        # Save high-res transparent outline PNG for printable coloring sheets & UI previews
        hi_gray = smooth_line_art(src_path, PRINT_SIZE, INNER_PADDING_RATIO)
        hi_alpha = np.clip(255 - np.array(hi_gray, dtype=np.int32), 0, 255).astype(np.uint8)
        hi_alpha[hi_alpha < 12] = 0
        hi_rgba = np.zeros((PRINT_SIZE, PRINT_SIZE, 4), dtype=np.uint8)
        hi_rgba[:, :, 3] = hi_alpha
        Image.fromarray(hi_rgba, mode="RGBA").save(out_dir / f"{species_id}-outline.png")

        # Save 384x384 transparent outline + mask PNGs in scripts/generated/ for demo generation & inspection
        canon_rgba = np.zeros((CANONICAL_SIZE, CANONICAL_SIZE, 4), dtype=np.uint8)
        canon_rgba[:, :, 3] = outline_alpha
        Image.fromarray(canon_rgba, mode="RGBA").save(debug_dir / f"{species_id}-canon-outline.png")
        Image.fromarray((mask_arr * 255).astype(np.uint8), mode="L").save(debug_dir / f"{species_id}-mask.png")

        # Quantize outline alpha to 4 levels (0..3 -> 0, 85, 170, 255) for super compact RLE
        q_alpha = ((outline_alpha.astype(np.int32) + 42) // 85).clip(0, 3).astype(np.uint8)
        species_masks[species_id] = {
            "size": CANONICAL_SIZE,
            "cropRect": list(crop_rect),
            "maskRle": encode_rle(mask_arr),
            "outlineRle": encode_rle(q_alpha),
        }

    out_json = ts_data_dir / "templateMasks.json"
    out_json.write_text(json.dumps(species_masks, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {out_json} ({out_json.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
