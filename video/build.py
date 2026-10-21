"""把静帧 + 字幕 + 旁白合成 16:9 1080p 产品短片。

流程：
1. 每张静帧用 zoompan 做推拉运镜，出独立片段
2. 片段之间用 xfade 交叉淡化，拼成无声主时间线
3. 旁白按镜头起点排布成一条音轨（adelay + amix）
4. 合流为 H.264 MP4
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FF = os.environ.get(
    "FFMPEG",
    r"C:\Users\Administrator\.workbuddy\binaries\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe",
)
SHOTS = os.path.join(HERE, "shots")
OVER = os.path.join(HERE, "overlay")
TMP = os.path.join(HERE, "build")
OUT = os.path.join(HERE, "out")
FPS = 30
W, H = 1920, 1080
XFADE = 0.45

os.makedirs(TMP, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

# name, 图片, 时长, 起始缩放, 结束缩放, 垂直锚点(0上 1下), 字幕编号, 台词编号(0=不新起), 是否带右侧面板
PLAN = [
    ("landing",  "v1-landing.png",         5.40, 1.00, 1.07, 0.50, 1, 1, False),
    ("ext1",     "v1-ext_default.png",     4.40, 1.10, 1.02, 0.25, 2, 2, True),
    ("ext2",     "v1-ext_rear.png",        4.20, 1.01, 1.09, 0.30, 3, 3, True),
    ("biz",      "v1-ext_biz.png",         3.60, 1.02, 1.10, 0.25, 4, 4, True),
    ("sport",    "v1-ext_sport.png",       3.40, 1.10, 1.03, 0.25, 5, 5, True),
    ("fresh",    "v1-ext_fresh.png",       3.60, 1.01, 1.09, 0.25, 5, 0, True),
    ("int_fwd",  "v2-int_fwd.png",         3.80, 1.16, 1.24, 0.72, 6, 6, True),
    ("int_left", "v2-int_left.png",        2.80, 1.24, 1.18, 0.72, 7, 7, True),
    ("int_right","v2-int_right.png",       2.80, 1.18, 1.24, 0.72, 7, 0, True),
    ("int_dash", "v1-int_dash.png",        2.60, 1.22, 1.28, 0.70, 8, 8, True),
    ("int_wood", "v1-int_dash_wood.png",   3.20, 1.28, 1.20, 0.70, 8, 0, True),
    ("endcard",  None,                     5.00, 1.00, 1.03, 0.50, 0, 9, False),
]
PANEL_W = 300
CANVAS_W = W - PANEL_W

lines = json.load(open(os.path.join(HERE, "tmp", "lines.json"), encoding="utf-8"))
VOICE_LEAD = 0.45

# ---- 主时间线：每段与上一段交叉淡化 XFADE 秒，所以起点要提前 ----
starts, t = [], 0.0
for i, s in enumerate(PLAN):
    starts.append(round(t, 3))
    t += s[2] - XFADE
TOTAL = round(starts[-1] + PLAN[-1][2], 3)
print(f"总时长 {TOTAL}s，{len(PLAN)} 个镜头")


def run(cmd, label):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(f"[FAIL] {label}\n{r.stderr[-2500:]}")
        sys.exit(1)


# ---- 1. 单镜头片段 ----
clips = []
for i, (name, img, dur, z0, z1, anchor, _cap, _line, has_panel) in enumerate(PLAN):
    dst = os.path.join(TMP, f"{i:02d}-{name}.mp4")
    clips.append(dst)
    frames = max(2, int(dur * FPS))
    if img is None:
        src = os.path.join(OVER, "endcard.png")
        vf = f"scale={W}:{H}:flags=lanczos,format=yuv420p"
        cmd = [FF, "-y", "-loglevel", "error", "-loop", "1", "-t", f"{dur}", "-i", src, "-vf", vf,
               "-r", str(FPS), "-t", f"{dur}", "-c:v", "libx264", "-preset", "medium",
               "-crf", "17", "-pix_fmt", "yuv420p", dst]
    else:
        src = os.path.join(SHOTS, img)
        # 先放大再 zoompan，减少推近时的整像素抖动
        zexpr = f"{z0}+({z1}-{z0})*on/{frames - 1}"
        if has_panel:
            # 3D 画布（左侧 1620px）自由运镜，右侧面板原样贴回，避免推拉把 UI 切掉
            fc = (
                f"[0:v]split=2[a][b];"
                f"[a]crop={CANVAS_W}:{H}:0:0,scale={int(CANVAS_W * 1.5)}:{int(H * 1.5)}:flags=lanczos,"
                f"zoompan=z='{zexpr}':x='(iw-iw/zoom)*0':y='(ih-ih/zoom)*{anchor}'"
                f":d={frames}:s={CANVAS_W}x{H}:fps={FPS}[cv];"
                f"[b]crop={PANEL_W}:{H}:{CANVAS_W}:0[pn];"
                f"[cv][pn]hstack=inputs=2,format=yuv420p[out]"
            )
            cmd = [FF, "-y", "-loglevel", "error", "-i", src, "-filter_complex", fc, "-map", "[out]",
                   "-r", str(FPS), "-t", f"{dur}", "-c:v", "libx264", "-preset", "medium",
                   "-crf", "17", "-pix_fmt", "yuv420p", dst]
        else:
            vf = (
                f"scale={W * 3 // 2}:{H * 3 // 2}:flags=lanczos,"
                f"zoompan=z='{zexpr}':x='(iw-iw/zoom)*0':y='(ih-ih/zoom)*{anchor}'"
                f":d={frames}:s={W}x{H}:fps={FPS},format=yuv420p"
            )
            cmd = [FF, "-y", "-loglevel", "error", "-i", src, "-vf", vf,
                   "-r", str(FPS), "-t", f"{dur}", "-c:v", "libx264", "-preset", "medium",
                   "-crf", "17", "-pix_fmt", "yuv420p", dst]
    run(cmd, f"clip {name}")
    print(f"  clip {name} {dur}s ok")

# ---- 2. xfade 串联 + 叠字幕 ----
inputs = []
for c in clips:
    inputs += ["-i", c]
cap_idx = sorted({p[6] for p in PLAN if p[6]})
for k in cap_idx:
    inputs += ["-i", os.path.join(OVER, f"cap_{k}.png")]

# 跨语义的接缝（外观↔内饰、实拍↔片尾卡）用黑场过渡，避免两张图叠成鬼影
SEAM_FADE_BLACK = {"ext1", "int_fwd", "endcard"}

fc = []
prev = "[0:v]"
for i in range(1, len(clips)):
    out = f"[x{i}]"
    kind = "fadeblack" if PLAN[i][0] in SEAM_FADE_BLACK else "fade"
    fc.append(f"{prev}[{i}:v]xfade=transition={kind}:duration={XFADE}:offset={starts[i]:.3f}{out}")
    prev = out

# 字幕：每段按自己的起止时间显示（淡入淡出用 alpha 表达式）
cap_map = {k: len(clips) + n for n, k in enumerate(cap_idx)}
for i, p in enumerate(PLAN):
    k = p[6]
    if not k:
        continue
    s = starts[i] + 0.35
    e = starts[i] + p[2] - 0.25
    if i + 1 < len(PLAN) and PLAN[i + 1][6] == k:  # 同一条字幕跨镜头，不淡出
        e = starts[i + 1] + PLAN[i + 1][2] - 0.25
    out = f"[c{i}]"
    fc.append(
        f"{prev}[{cap_map[k]}:v]overlay=x=88:y={H - 128}:"
        f"enable='between(t,{s:.2f},{e:.2f})'{out}"
    )
    prev = out

fc.append(f"{prev}fade=t=in:st=0:d=0.6,fade=t=out:st={TOTAL - 0.7:.2f}:d=0.7[vout]")

silent = os.path.join(TMP, "silent.mp4")
run([FF, "-y", "-loglevel", "error", *inputs,
     "-filter_complex", ";".join(fc), "-map", "[vout]",
     "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "17",
     "-pix_fmt", "yuv420p", "-t", f"{TOTAL}", silent], "xfade")
print("无声主时间线 ok")

# ---- 3. 旁白音轨 ----
ain = ["-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo:d={TOTAL}"]
for n, ln in enumerate(lines, 1):
    ain += ["-i", os.path.join(HERE, "tmp", ln["file"])]

delays = []  # 与 lines 等长的毫秒起点
for ln in lines:
    idx = next(i for i, p in enumerate(PLAN) if p[7] == ln["index"])
    at = round((starts[idx] + VOICE_LEAD) * 1000)
    delays.append(at)
    end = starts[idx] + VOICE_LEAD + ln["dur"]
    shot_end = starts[idx] + PLAN[idx][2]
    fits = end <= shot_end + 0.15
    print(
        f"  第{ln['index']}句 -> 镜头 {PLAN[idx][0]:<9} @{at / 1000:5.2f}s "
        f"时长 {ln['dur']:.2f}s 收尾 {end:.2f}s / 镜头末 {shot_end:.2f}s  {'ok' if fits else '⚠ 溢出'}"
    )

af = ";".join(
    f"[{i + 1}:a]adelay={d}|{d},volume=1.0[a{i}]" for i, d in enumerate(delays)
)
mix = "".join(f"[a{i}]" for i in range(len(delays)))
af += f";[0:a]{mix}amix=inputs={len(delays) + 1}:normalize=0:dropout_transition=0[aout]"

voice = os.path.join(TMP, "voice.wav")
run([FF, "-y", "-loglevel", "error", *ain, "-filter_complex", af,
     "-map", "[aout]", "-t", f"{TOTAL}", "-ar", "48000", "-ac", "2", voice], "audio")
print("旁白音轨 ok")

# ---- 4. 合流 ----
final = os.path.join(OUT, "neixiu-intro-1080p.mp4")
run([FF, "-y", "-loglevel", "error", "-i", silent, "-i", voice,
     "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
     "-shortest", "-movflags", "+faststart", final], "mux")
print("输出:", final, round(os.path.getsize(final) / 1048576, 2), "MB")
