#!/usr/bin/env python3
"""
针对每张高度超过 VIEWPORT_H 的截图，单独生成 5 秒内的滚动预览 GIF。
矮图跳过不处理。

用法:
    python3 scripts/generate_scroll_gif.py

输出:
    public/screenshot/scroll_*.gif
"""

import os
import glob
from PIL import Image
import imageio.v3 as iio

# ============ 配置 ============
SCREENSHOT_DIR = "public/screenshot"
VIEWPORT_H = 800           # 超过这个高度才做滚动
MAX_DURATION_S = 5         # 每张 GIF 最长滚动时间（秒）
FPS = 15                   # 帧率
COLORS = 64                # GIF 调色板颜色数
# ==============================


def get_screenshots():
    """读取所有截图文件，排除已生成的 GIF/MP4"""
    files = sorted(glob.glob(os.path.join(SCREENSHOT_DIR, "*.png")))
    return [f for f in files if not os.path.basename(f).startswith("scroll_")]


def generate_scroll_for_image(img_path, output_dir):
    """为单张高图生成滚动 GIF，5 秒内滚完"""
    img = Image.open(img_path).convert("RGB")
    w, h = img.size

    if h <= VIEWPORT_H:
        return None  # 矮图跳过

    max_y = h - VIEWPORT_H
    total_frames = int(MAX_DURATION_S * FPS)  # 5s * 15fps = 75 帧
    scroll_step = max(1, max_y // total_frames)
    actual_frames = (max_y // scroll_step) + 1

    frames = []
    y = 0
    while y <= max_y:
        crop = img.crop((0, y, w, min(y + VIEWPORT_H, h)))
        frames.append(crop)
        y += scroll_step

    # 结尾多停几帧，让用户看清底部
    for _ in range(FPS):
        frames.append(frames[-1])

    # 调色板压缩
    palette_frames = [f.quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT) for f in frames]
    duration_ms = int(1000 / FPS)

    base_name = os.path.splitext(os.path.basename(img_path))[0]
    safe_name = base_name.replace(" ", "_").replace("（", "_").replace("）", "_").replace("/", "_")
    out_path = os.path.join(output_dir, f"scroll_{safe_name}.gif")

    iio.imwrite(
        out_path,
        palette_frames,
        extension=".gif",
        duration=duration_ms,
        loop=0,
    )

    size_kb = os.path.getsize(out_path) / 1024
    return {
        "path": out_path,
        "frames": len(frames),
        "size_kb": size_kb,
        "orig_h": h,
    }


def main():
    paths = get_screenshots()
    if not paths:
        print(f"❌ 未在 {SCREENSHOT_DIR} 找到截图文件")
        return

    print(f"📸 找到 {len(paths)} 张截图，视口高度 {VIEWPORT_H}px，滚动时间 ≤{MAX_DURATION_S}s\n")

    results = []
    for p in paths:
        name = os.path.basename(p)
        result = generate_scroll_for_image(p, SCREENSHOT_DIR)
        if result:
            print(f"✅ {name}")
            print(f"   原图高度 {result['orig_h']}px → {result['frames']} 帧 → {result['size_kb']:.0f} KB")
            results.append(result)
        else:
            print(f"⏭️  {name}（高度 ≤{VIEWPORT_H}px，跳过）")

    print(f"\n🎉 共生成 {len(results)} 个滚动 GIF")
    total_kb = sum(r["size_kb"] for r in results)
    print(f"   总大小: {total_kb:.0f} KB")


if __name__ == "__main__":
    main()
