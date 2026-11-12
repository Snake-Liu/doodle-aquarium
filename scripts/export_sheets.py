import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def load_spec_from_ts(root: Path) -> dict:
    js = """
    import { SHEET_LAYOUT } from './src/scanner/sheetLayout.ts';
    import { SPECIES_LIST } from './src/domain/species.ts';
    console.log(JSON.stringify({ layout: SHEET_LAYOUT, species: SPECIES_LIST }));
    """
    res = subprocess.run(
        ["node", "--input-type=module", "-e", js],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(res.stdout)


def draw_marker(draw: ImageDraw.ImageDraw, cx: float, cy: float, size: float, mod_ratio: int) -> None:
    mod = size / mod_ratio
    x0, y0 = cx - size / 2, cy - size / 2
    draw.rectangle([x0, y0, x0 + size, y0 + size], fill=(15, 18, 22, 255))
    draw.rectangle([x0 + mod, y0 + mod, x0 + size - mod, y0 + size - mod], fill=(255, 255, 255, 255))
    draw.rectangle([x0 + 2 * mod, y0 + 2 * mod, x0 + size - 2 * mod, y0 + size - 2 * mod], fill=(15, 18, 22, 255))


def get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        "C:/Windows/Fonts/msjhbd.ttc",
        "C:/Windows/Fonts/msjh.ttc",
        "C:/Windows/Fonts/mingliu.ttc",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    data = load_spec_from_ts(root)
    layout = data["layout"]
    pp = layout["printPage"]
    w, h = pp["width"], pp["height"]
    fx, fy, fsize = pp["scanFrameX"], pp["scanFrameY"], pp["scanFrameSize"]
    scale = fsize / layout["canonicalSize"]

    out_dir = root / "public" / "sheets"
    out_dir.mkdir(parents=True, exist_ok=True)
    title_font = get_font(54)
    sub_font = get_font(30)
    foot_font = get_font(26)

    for sp in data["species"]:
        page = Image.new("RGBA", (w, h), (255, 255, 255, 255))
        draw = ImageDraw.Draw(page)
        draw.text((w / 2, 130), f"塗鴉水族箱 專用圖紙 — {sp['name']}", fill=(12, 74, 110, 255), font=title_font, anchor="mm")
        draw.text((w / 2, 215), "請在線稿裡塗上喜歡的顏色，四個黑色「回」字框與條碼請留白喔！", fill=(71, 85, 105, 255), font=sub_font, anchor="mm")

        draw.rectangle([fx - 14, fy - 14, fx + fsize + 14, fy + fsize + 14], outline=(203, 213, 225, 255), width=3)

        for key in ("tl", "tr", "br", "bl"):
            m = layout["markers"][key]
            draw_marker(draw, fx + m["x"] * scale, fy + m["y"] * scale, layout["markerSize"] * scale, layout["markerModuleRatio"])

        bc = layout["barcode"]
        bits = list(bc["startSync"]) + list(sp["barcodeBits"]) + list(bc["endSync"])
        cell_w = (bc["width"] * scale) / bc["cellCount"]
        for i, bit in enumerate(bits):
            if bit == 1:
                x0 = fx + bc["x"] * scale + i * cell_w + 2
                y0 = fy + bc["y"] * scale
                draw.rectangle([x0, y0, x0 + cell_w - 4, y0 + bc["height"] * scale], fill=(15, 18, 22, 255))

        outline = Image.open(root / "public" / "templates" / f"{sp['id']}-outline.png").convert("RGBA")
        tb = layout["templateBox"]
        target_sz = int(round(tb["size"] * scale))
        resized = outline.resize((target_sz, target_sz), Image.Resampling.LANCZOS)
        page.paste(resized, (int(round(fx + tb["x"] * scale)), int(round(fy + tb["y"] * scale))), resized)

        draw.text((w / 2, 1550), "畫完後打開手機「塗鴉水族箱」點選「掃描塗鴉」，讓牠游進你的水族箱吧！", fill=(100, 116, 139, 255), font=foot_font, anchor="mm")
        out_path = out_dir / f"sheet-{sp['id']}.png"
        page.convert("RGB").save(out_path)
        print(f"Exported {out_path}")


if __name__ == "__main__":
    main()
