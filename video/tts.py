"""生成旁白音频：每句一条 mp3，并输出 mp3 真实时长（纯 Python 解析帧头，不依赖 ffmpeg）。"""
import asyncio
import json
import os
import struct
import edge_tts

VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "+6%"

LINES = [
    "车漆，是给别人看的。内饰，才是给自己的。",
    "内秀，一个可以坐进去的三维内饰空间。",
    "绕着车身走一圈，每一条腰线都看得清。",
    "四套搭配方案，一键切换。",
    "沉稳商务，运动红黑，青春气息。不同性格，不同座舱。",
    "点进内饰，车顶自动让开。",
    "视线固定在前排两座之间，拖拽就能左右环视。",
    "座椅、门板、仪表台，点哪一块，改哪一块。",
    # 结束语：核心主张落在片尾，念完后片尾卡静止 1 秒再黑场收尾
    "内饰不必千篇一律。你的座驾，你来定风格。",
]

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "tmp")


def mp3_duration(path: str) -> float:
    """遍历 MPEG 音频帧，按采样率累计时长。"""
    data = open(path, "rb").read()
    i, samples = 0, 0.0
    n = len(data)
    while i + 4 <= n:
        if data[i] != 0xFF or (data[i + 1] & 0xE0) != 0xE0:
            i += 1
            continue
        ver = (data[i + 1] >> 3) & 0x03  # 3=MPEG1, 2=MPEG2, 0=MPEG2.5
        layer = (data[i + 1] >> 1) & 0x03
        if layer != 1:  # 只处理 Layer III
            i += 1
            continue
        br_idx = (data[i + 2] >> 4) & 0x0F
        sr_idx = (data[i + 2] >> 2) & 0x03
        pad = (data[i + 2] >> 1) & 0x01
        sr_table = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}
        br_table = {
            3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
            2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
            0: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
        }
        if sr_idx == 3 or br_idx in (0, 15):
            i += 1
            continue
        sr = sr_table.get(ver, [24000, 24000, 24000])[sr_idx]
        br = br_table[ver if ver in (3, 2) else 0][br_idx] * 1000
        spf = 1152 if ver == 3 else 576
        frame_len = int(spf / 8 * br / sr) + pad
        if frame_len <= 0:
            i += 1
            continue
        samples += spf
        i += frame_len
    return round(samples / sr, 3) if samples else 0.0


async def main():
    os.makedirs(OUT, exist_ok=True)
    meta = []
    for idx, text in enumerate(LINES, 1):
        path = os.path.join(OUT, f"line_{idx}.mp3")
        comm = edge_tts.Communicate(text, VOICE, rate=RATE)
        await comm.save(path)
        dur = mp3_duration(path)
        meta.append({"index": idx, "text": text, "file": f"line_{idx}.mp3", "dur": dur})
        print(f"{idx}. {dur:5.2f}s  {text}")
    with open(os.path.join(OUT, "lines.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print("total speech:", round(sum(m["dur"] for m in meta), 2), "s")


asyncio.run(main())
