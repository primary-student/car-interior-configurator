"""补齐 ffmpeg 压缩包缺失的尾部（多线程分段下载），然后拼装校验。"""
import os
import threading
import urllib.request

URL = "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip"
DIR = r"C:\Users\Administrator\.workbuddy\binaries\ffmpeg"
TOTAL = 114768076
CH = 14346010
P7_START = 7 * CH

os.chdir(DIR)
cur = os.path.getsize("part_7")
start = P7_START + cur
end = TOTAL - 1
length = end - start + 1
N = 6
seg = (length + N - 1) // N
print(f"part_7={cur}B, 尾部 {start}..{end} 共 {length} 字节，{N} 段")


def fetch(i, a, b):
    path = f"tail_{i}"
    for attempt in range(6):
        try:
            req = urllib.request.Request(URL, headers={"Range": f"bytes={a}-{b}"})
            with urllib.request.urlopen(req, timeout=90) as r, open(path, "wb") as f:
                while True:
                    chunk = r.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
            got = os.path.getsize(path)
            if got == b - a + 1:
                print(f"  seg{i} ok {got}B")
                return
            print(f"  seg{i} 不完整 {got}/{b - a + 1}，重试")
        except Exception as e:  # noqa: BLE001
            print(f"  seg{i} 第{attempt + 1}次失败: {e}")
    raise SystemExit(f"seg{i} 下载失败")


threads = []
for i in range(N):
    a = start + i * seg
    b = min(a + seg - 1, end)
    t = threading.Thread(target=fetch, args=(i, a, b))
    t.start()
    threads.append(t)
for t in threads:
    t.join()

with open("part_7", "ab") as out:
    for i in range(N):
        with open(f"tail_{i}", "rb") as f:
            out.write(f.read())

parts = [f"part_{i}" for i in range(8)]
size = sum(os.path.getsize(p) for p in parts)
print(f"总字节 {size} / {TOTAL} {'✅' if size == TOTAL else '❌'}")
with open("ff.zip", "wb") as out:
    for p in parts:
        with open(p, "rb") as f:
            out.write(f.read())
print("ff.zip", round(os.path.getsize("ff.zip") / 1048576, 1), "MB")
