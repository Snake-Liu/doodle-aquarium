from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def stroke_crayon(draw: ImageDraw.ImageDraw, x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int, int], width: int) -> None:
    draw.line([(x0, y0), (x1, y1)], fill=color, width=width)
    r = width // 2
    draw.ellipse([x0 - r, y0 - r, x0 + r, y0 + r], fill=color)
    draw.ellipse([x1 - r, y1 - r, x1 + r, y1 + r], fill=color)


def make_crayon_texture(species_id: str, size: int, crop_rect: list[int], mask_arr: np.ndarray, outline_arr: np.ndarray, out_path: Path) -> None:
    rng = np.random.default_rng(hash(species_id) & 0xFFFFFFFF)
    if species_id == "clownfish":
        canvas = Image.new("RGBA", (size, size), (255, 148, 66, 255))
        draw = ImageDraw.Draw(canvas)
        for _ in range(180):
            x0 = int(rng.integers(25, size - 25))
            y0 = int(rng.integers(85, size - 85))
            stroke_crayon(draw, x0, y0, x0 + int(rng.integers(-28, 28)), y0 + int(rng.integers(-18, 18)), (255, 118, 48, 130), int(rng.integers(14, 24)))
        # White clownfish stripes with soft hand-drawn variation
        for x_band in (118, 214):
            for y in range(70, size - 70, 8):
                stroke_crayon(draw, x_band - 8, y, x_band + 8, y + 6, (255, 252, 244, 220), 18)
    elif species_id == "turtle":
        canvas = Image.new("RGBA", (size, size), (144, 216, 122, 255))
        draw = ImageDraw.Draw(canvas)
        colors = [(82, 198, 144, 150), (245, 206, 86, 140), (62, 178, 166, 150)]
        for i in range(160):
            x0 = int(rng.integers(25, size - 25))
            y0 = int(rng.integers(70, size - 70))
            stroke_crayon(draw, x0, y0, x0 + int(rng.integers(-30, 30)), y0 + int(rng.integers(-22, 22)), colors[i % len(colors)], int(rng.integers(16, 26)))
        stroke_crayon(draw, 285, 125, 330, 150, (172, 228, 118, 210), 60)
    else:  # jellyfish
        canvas = Image.new("RGBA", (size, size), (255, 186, 222, 255))
        draw = ImageDraw.Draw(canvas)
        colors = [(255, 138, 198, 150), (190, 150, 255, 150), (132, 212, 255, 150)]
        for i in range(180):
            x0 = int(rng.integers(35, size - 35))
            y0 = int(rng.integers(30, size - 30))
            stroke_crayon(draw, x0, y0, x0 + int(rng.integers(-28, 28)), y0 + int(rng.integers(-28, 28)), colors[i % len(colors)], int(rng.integers(14, 26)))

    canvas = canvas.filter(ImageFilter.GaussianBlur(radius=1.0))
    arr = np.array(canvas, dtype=np.int16)
    grain = rng.integers(-12, 13, size=(size, size, 1))
    arr[:, :, :3] = np.clip(arr[:, :, :3] + grain, 0, 255)
    arr[:, :, 3] = np.where(mask_arr > 0, 255, 0)
    textured = Image.fromarray(arr.astype(np.uint8), mode="RGBA")

    outline_rgba = np.zeros((size, size, 4), dtype=np.uint8)
    outline_rgba[:, :, 3] = outline_arr
    outline_img = Image.fromarray(outline_rgba, mode="RGBA")
    final_img = Image.alpha_composite(textured, outline_img)

    cx, cy, cw, ch = crop_rect
    final_img.crop((cx, cy, cx + cw, cy + ch)).save(out_path)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    masks = json.loads((root / "src" / "domain" / "generated" / "templateMasks.json").read_text(encoding="utf-8"))
    demo_dir = root / "public" / "demos"
    demo_dir.mkdir(parents=True, exist_ok=True)

    for sid in ("clownfish", "turtle", "jellyfish"):
        entry = masks[sid]
        size = entry["size"]
        mask_arr = np.array(Image.open(root / "scripts" / "generated" / f"{sid}-mask.png").convert("L")) > 127
        outline_img = Image.open(root / "scripts" / "generated" / f"{sid}-canon-outline.png").convert("RGBA")
        outline_arr = np.array(outline_img)[:, :, 3]
        out_path = demo_dir / f"demo-{sid}.png"
        make_crayon_texture(sid, size, entry["cropRect"], mask_arr, outline_arr, out_path)
        print(f"Generated {out_path}")


if __name__ == "__main__":
    main()
