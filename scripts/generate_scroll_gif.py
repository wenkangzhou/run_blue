#!/usr/bin/env python3
"""
把多张截图拼接成长图，然后模拟手机屏幕滚动生成 GIF。

用法:
    python3 scripts/generate_scroll_gif.py

输出:
    public/screenshot/scroll_preview.gif
"""

import os
import glob
from PIL import Image, ImageDraw, ImageFont
import imageio.v3 as iio

# ============ 配置 ============
SCREENSHOT_DIR = "public/screenshot"
OUTPUT_PATH = "public/screenshot/scroll_preview.gif"
VIEWPORT_H = 750           # 模拟手机屏幕高度
SCROLL_STEP = 100          # 每帧滚动像素（越大文件越小）
FPS = 10                   # 帧率
PAUSE_FRAMES = 4           # 每张图交界处停留帧数
LEADING_FRAMES = 3         # 开头停留帧数
TRAILING_FRAMES = 3        # 结尾停留帧数
BG_COLOR = (24, 24, 27)    # zinc-950 背景色 #18181b
GAP = 40                   # 图与图之间的间距
LABEL_H = 50               # 图片标签高度
FONT_SIZE = 18
# ==============================


def get_screenshots():
    """按自定义顺序读取截图文件"""
    order = [
        "AI 训练分析（活动详情页）.png",
        "AI 训练分析（活动详情页）_比赛.png",
        "个人档案馆.png",
        "数据总览（活动列表页）.png",
        "数据可视化（统计页）.png",
        "AI训练计划png.png",
        "路线地图.png",
        "路线收藏.png",
        "单次运动海报分享.png",
        "周期海报分享.png",
    ]
    files = []
    for name in order:
        path = os.path.join(SCREENSHOT_DIR, name)
        if os.path.exists(path):
            files.append(path)
    # 兜底：如果没找到按顺序的，就读取目录下所有 png
    if not files:
        files = sorted(glob.glob(os.path.join(SCREENSHOT_DIR, "*.png")))
    return files


def add_label(img, text, font_size=FONT_SIZE):
    """在图片顶部添加文字标签"""
    w, h = img.size
    new_h = h + LABEL_H
    new_img = Image.new("RGB", (w, new_h), BG_COLOR)
    new_img.paste(img, (0, LABEL_H))
    draw = ImageDraw.Draw(new_img)
    # 尝试加载等宽字体
    font = None
    for font_name in ["SFMono-Regular", "Menlo", "Courier", "DejaVuSansMono"]:
        try:
            font = ImageFont.truetype(font_name, font_size)
            break
        except:
            pass
    if font is None:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((w - tw) // 2, (LABEL_H - th) // 2), text, fill=(250, 250, 250), font=font)
    return new_img


def build_long_image(paths, target_w=360):
    """把所有截图拼成一张长图，统一宽度"""
    images = []
    for p in paths:
        img = Image.open(p).convert("RGB")
        # 统一宽度，等比缩放
        w, h = img.size
        if w != target_w:
            ratio = target_w / w
            new_h = int(h * ratio)
            img = img.resize((target_w, new_h), Image.LANCZOS)
        # 提取文件名作为标签
        name = os.path.splitext(os.path.basename(p))[0]
        img = add_label(img, name)
        images.append(img)

    # 计算总高度
    total_h = sum(img.size[1] for img in images) + GAP * (len(images) - 1)
    long_img = Image.new("RGB", (target_w, total_h), BG_COLOR)

    y = 0
    section_marks = []  # 记录每张图的起始位置
    for i, img in enumerate(images):
        section_marks.append(y)
        long_img.paste(img, (0, y))
        y += img.size[1]
        if i < len(images) - 1:
            y += GAP

    return long_img, section_marks


def generate_scroll_gif(long_img, section_marks, output_path):
    """模拟滚动效果生成 GIF"""
    w, total_h = long_img.size
    max_y = total_h - VIEWPORT_H
    if max_y <= 0:
        max_y = 0

    frames = []
    y = 0

    # 开头停留
    for _ in range(LEADING_FRAMES):
        frames.append(long_img.crop((0, 0, w, min(VIEWPORT_H, total_h))))

    prev_section_idx = 0
    while y <= max_y:
        crop = long_img.crop((0, y, w, min(y + VIEWPORT_H, total_h)))
        frames.append(crop)

        # 检查是否即将进入下一张图的区域，如果是则多停几帧
        next_section_idx = prev_section_idx
        for idx, mark in enumerate(section_marks):
            if mark > y + VIEWPORT_H // 2:
                next_section_idx = idx
                break

        if next_section_idx != prev_section_idx and next_section_idx > 0:
            # 即将切换到下一张图，停留
            for _ in range(PAUSE_FRAMES):
                frames.append(crop)
            prev_section_idx = next_section_idx

        y += SCROLL_STEP

    # 结尾停留
    if max_y > 0:
        final_crop = long_img.crop((0, max_y, w, total_h))
        for _ in range(TRAILING_FRAMES):
            frames.append(final_crop)

    # 保存 GIF
    frame_arrays = [f.convert("RGB") for f in frames]
    duration_ms = int(1000 / FPS)

    # 转为调色板模式（48色）大幅减小体积
    palette_frames = [f.quantize(colors=48, method=Image.Quantize.MEDIANCUT) for f in frame_arrays]

    iio.imwrite(
        output_path,
        palette_frames,
        extension=".gif",
        duration=duration_ms,
        loop=0,
    )

    print(f"✅ 已生成滚动 GIF: {output_path}")
    print(f"   共 {len(frames)} 帧，分辨率 {w}x{VIEWPORT_H}，帧率 {FPS}fps")
    size_kb = os.path.getsize(output_path) / 1024
    print(f"   文件大小: {size_kb:.1f} KB")

    # 同时生成 MP4（体积小 10-20 倍，README 可用 <video> 标签）
    mp4_path = output_path.replace(".gif", ".mp4")
    tmp_dir = "/tmp/scroll_frames"
    os.makedirs(tmp_dir, exist_ok=True)
    try:
        for idx, frame in enumerate(frame_arrays):
            frame.save(os.path.join(tmp_dir, f"frame_{idx:05d}.png"))
        cmd = (
            f"ffmpeg -y -framerate {FPS} -i {tmp_dir}/frame_%05d.png "
            f"-c:v libx264 -pix_fmt yuv420p -crf 28 -preset fast "
            f"-movflags +faststart {mp4_path} >/dev/null 2>&1"
        )
        ret = os.system(cmd)
        if ret == 0:
            mp4_size_kb = os.path.getsize(mp4_path) / 1024
            print(f"✅ 已生成 MP4 视频: {mp4_path}")
            print(f"   文件大小: {mp4_size_kb:.1f} KB")
        else:
            print(f"⚠️ FFmpeg 合成 MP4 失败")
    except Exception as e:
        print(f"⚠️ MP4 生成失败（不影响 GIF）: {e}")
    finally:
        for f in glob.glob(f"{tmp_dir}/*.png"):
            os.remove(f)


def main():
    paths = get_screenshots()
    if not paths:
        print(f"❌ 未在 {SCREENSHOT_DIR} 找到截图文件")
        return

    print(f"📸 找到 {len(paths)} 张截图:")
    for p in paths:
        print(f"   - {os.path.basename(p)}")

    print("\n🔄 正在拼接长图...")
    long_img, section_marks = build_long_image(paths)
    print(f"   长图尺寸: {long_img.size[0]}x{long_img.size[1]}")

    print("\n🎬 正在生成滚动 GIF...")
    generate_scroll_gif(long_img, section_marks, OUTPUT_PATH)


if __name__ == "__main__":
    main()
