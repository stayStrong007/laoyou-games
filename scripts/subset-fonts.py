"""像素字体子集化：Logo、标语、弹窗标题这类固定文案改动后重新运行。

收集 public/index.html 和 scripts/og-image.html 里带 data-pixel 属性的元素中的文字，
把缝合像素字体截成只含这些字（外加英文和数字）的 public/fonts/lg-pixel.woff2，
把 Press Start 2P 截成只含英文和数字的 public/fonts/lg-arcade.woff2。

Press Start 2P 的授权保留了字体名，按 OFL 规定，修改（含截取）后的字体不能再用原名，
所以两款字体都改名为 "LG Pixel" / "LG Arcade"，版权和授权信息原样保留。

用法：
  python scripts/subset-fonts.py --fusion <fusion-pixel-12px-proportional-zh_hans.otf.woff2> --press-start <PressStart2P-Regular.ttf>

依赖：pip install fonttools brotli
字体来源：
  缝合像素字体  https://github.com/TakWolf/fusion-pixel-font/releases（12px proportional 的 woff2 包，取 zh_hans）
  Press Start 2P https://github.com/google/fonts/tree/main/ofl/pressstart2p
"""

import argparse
import sys
from html.parser import HTMLParser
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [ROOT / "public" / "index.html", ROOT / "scripts" / "og-image.html"]
OUT_DIR = ROOT / "public" / "fonts"
ASCII = "".join(chr(c) for c in range(0x20, 0x7F))


class PixelTextCollector(HTMLParser):
    """收集带 data-pixel 属性的元素（包括它的子元素）里的文字。"""

    VOID = {"area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "wbr"}

    def __init__(self):
        super().__init__()
        self.depth = 0
        self.chunks = []

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID:
            return
        if self.depth or any(name == "data-pixel" for name, _ in attrs):
            self.depth += 1

    def handle_endtag(self, tag):
        if self.depth and tag not in self.VOID:
            self.depth -= 1

    def handle_data(self, data):
        if self.depth:
            self.chunks.append(data)


def rename(font, family):
    ps_name = family.replace(" ", "") + "-Regular"
    for record in font["name"].names:
        if record.nameID in (1, 16):
            record.string = family
        elif record.nameID == 4:
            record.string = family
        elif record.nameID in (3, 6):
            record.string = ps_name
    if "CFF " in font:
        cff = font["CFF "].cff
        cff.fontNames = [ps_name]
        top = cff.topDictIndex[0]
        top.FullName = family
        top.FamilyName = family


def make_subset(src, dst, text, family):
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    font = subset.load_font(str(src), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    rename(font, family)
    subset.save_font(font, str(dst), options)
    cmap = font.getBestCmap()
    missing = sorted({ch for ch in text if ord(ch) not in cmap and not ch.isspace()})
    print(f"{dst.relative_to(ROOT)}：{len(font.getGlyphOrder())} 个字形，{dst.stat().st_size} 字节")
    if missing:
        print(f"  注意：字体里没有这些字，会用系统字体显示：{''.join(missing)}")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows 下输出到 Git Bash 等终端时避免中文乱码
    parser = argparse.ArgumentParser(description="像素字体子集化")
    parser.add_argument("--fusion", required=True, type=Path, help="缝合像素字体 12px proportional zh_hans 文件")
    parser.add_argument("--press-start", required=True, type=Path, help="PressStart2P-Regular.ttf")
    args = parser.parse_args()

    collector = PixelTextCollector()
    for path in SOURCES:
        if path.exists():
            collector.feed(path.read_text(encoding="utf-8"))
    chars = set("".join(collector.chunks)) - set("\r\n\t")
    print(f"固定文案共 {len(chars)} 个不同字符：{''.join(sorted(chars))}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    make_subset(args.fusion, OUT_DIR / "lg-pixel.woff2", "".join(sorted(chars)) + ASCII, "LG Pixel")
    make_subset(args.press_start, OUT_DIR / "lg-arcade.woff2", ASCII, "LG Arcade")


if __name__ == "__main__":
    main()
