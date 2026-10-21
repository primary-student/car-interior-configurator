"""生成「内秀 NEIXIU」参赛 PPT —— AWS 鬼点子计划 · 赛道一 无用之用

版式：16:9 (13.333 x 7.5 in)，深色底 + 铜金，与网站视觉一致。
"""
import os
from lxml import etree
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(HERE, "assets")

# ---------- 设计令牌 ----------
BG, CARD, LINE = "0D0D0F", "17171B", "2E2E35"
GOLD, TEXT, MUTED, DIM = "B08356", "F2ECE5", "9A948D", "5E5A55"
RED = "D0021B"
LIGHT, BODY = "Microsoft YaHei Light", "Microsoft YaHei"

W, H = 13.333, 7.5
L = 0.95                     # 左边距
CW = W - L * 2               # 内容宽 11.433

prs = Presentation()
prs.slide_width = Inches(W)
prs.slide_height = Inches(H)
BLANK = prs.slide_layouts[6]


# ---------- 基础工具 ----------
def _font(run, size, color, font, bold=False, spc=None, italic=False):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)
    run.font.name = font
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn("a:ea"))
    if ea is None:
        ea = etree.SubElement(rPr, qn("a:ea"))
    ea.set("typeface", font)
    if spc:
        rPr.set("spc", str(int(spc * 100)))


def txt(s, x, y, w, h, text, size=15, color=TEXT, font=LIGHT,
        bold=False, align=PP_ALIGN.LEFT, line=1.35, spc=None,
        anchor=MSO_ANCHOR.TOP, margin=0):
    box = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(margin)
    tf.margin_top = tf.margin_bottom = 0
    for i, ln in enumerate(str(text).split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line
        r = p.add_run()
        r.text = ln
        _font(r, size, color, font, bold, spc)
    return box


def card(s, x, y, w, h, fill=CARD, line_color=LINE, lw=1.0):
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.shadow.inherit = False
    if fill:
        sh.fill.solid()
        sh.fill.fore_color.rgb = RGBColor.from_string(fill)
    else:
        sh.fill.background()
    if line_color:
        sh.line.color.rgb = RGBColor.from_string(line_color)
        sh.line.width = Pt(lw)
    else:
        sh.line.fill.background()
    sh.text_frame.text = ""
    return sh


def bar(s, x, y, w, h=0.9, color=GOLD):
    """细分隔线：用极薄矩形保证在任何渲染器里都可见"""
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(0.014))
    sh.shadow.inherit = False
    sh.fill.solid()
    sh.fill.fore_color.rgb = RGBColor.from_string(color)
    sh.line.fill.background()
    return sh


def vbar(s, x, y, h, w=0.014, color=GOLD):
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.shadow.inherit = False
    sh.fill.solid()
    sh.fill.fore_color.rgb = RGBColor.from_string(color)
    sh.line.fill.background()
    return sh


def pic(s, name, x, y, w, h):
    return s.shapes.add_picture(os.path.join(A, name), Inches(x), Inches(y), Inches(w), Inches(h))


def framed(s, name, x, y, w, h, color=LINE):
    """图片 + 细描边，避免浅底截图在深色页上散开"""
    pic(s, name, x, y, w, h)
    card(s, x, y, w, h, fill=None, line_color=color, lw=0.9)


def new(bg=BG):
    s = prs.slides.add_slide(BLANK)
    card(s, 0, 0, W, H, fill=bg, line_color=None)
    return s


def label(s, text, y=0.62):
    txt(s, L, y, 8.0, 0.3, text, 10.5, GOLD, BODY, spc=2.4)


def head(s, text, y=1.02, size=31, w=CW):
    txt(s, L, y, w, 1.2, text, size, TEXT, LIGHT, line=1.28)


def foot(s, idx, note=""):
    txt(s, L, 6.94, 8.0, 0.28, note, 9.5, DIM, BODY, spc=1.2)
    txt(s, W - L - 0.6, 6.94, 0.6, 0.28, f"{idx:02d}", 9.5, DIM, BODY, align=PP_ALIGN.RIGHT)


def notes(s, text):
    s.notes_slide.notes_text_frame.text = text


# =========================================================
# 01 封面
# =========================================================
s = new()
pic(s, "hero.jpg", 0, 0, W, H)
txt(s, L, 0.86, 9.0, 0.3, "AWS 鬼点子计划 · 线上赛　｜　赛道一　无用之用", 10.5, GOLD, BODY, spc=2.4)
txt(s, L, 2.45, 8.4, 1.5, "内秀 NEIXIU", 62, TEXT, LIGHT, spc=6)
bar(s, L, 3.74, 1.35)
txt(s, L, 4.04, 9.2, 0.6, "一个故意不卖车的汽车配置器", 25, GOLD, LIGHT, spc=1.6)
txt(s, L, 6.42, 9.0, 0.3, "3D 汽车内饰定制　·　React 19 + three.js + GLB", 10.5, MUTED, BODY, spc=1.4)
txt(s, W - L - 2.6, 6.42, 2.6, 0.3, "2026.10　个人参赛", 10.5, MUTED, BODY, align=PP_ALIGN.RIGHT, spc=1.4)
notes(s, "开场只说一句：这是我用 AI 做的一个汽车内饰配置器，但它故意不卖车。\n"
         "预判：这不就是个配置器吗？→ 先别急，下一页再说它为什么“没用”。")

# =========================================================
# 02 钩子
# =========================================================
s = new()
label(s, "01 / 先把话说明白", 0.9)
txt(s, L, 2.05, 10.6, 2.6, "你在这里配的车，\n提不走。", 60, TEXT, LIGHT, line=1.22, spc=3)
txt(s, L, 5.05, 9.6, 0.9, "没有价格，没有留资，没有“咨询销售”。\n这是故意的。", 17, MUTED, LIGHT, line=1.7, spc=0.8)
notes(s, "钩子页。停顿两秒再念下一句。\n"
         "预判：那做它干嘛？→ 下一页给答案：因为所有同类产品最后都变成了销售漏斗。")

# =========================================================
# 03 观察
# =========================================================
s = new()
label(s, "02 / 一个观察")
head(s, "汽车配置器，最后都会通向一个「留下手机号」", 1.02, 30)
rows = [
    ("01", "车企官网的选配器", "配完 → 留资 → 等销售电话。配置只是表单的前戏。"),
    ("02", "「个性化」是卖车的糖衣", "颜色越多、动画越顺，越像在催你下单。"),
    ("03", "你看到的永远是别人选好的那台", "坐不进去，只能看图；内饰永远是赠品，不是主角。"),
]
y = 2.62
for i, (n, t1, t2) in enumerate(rows):
    card(s, L, y, CW, 1.08, fill=None, line_color=LINE)
    txt(s, L + 0.34, y + 0.3, 0.7, 0.4, n, 15, GOLD, BODY, spc=1)
    txt(s, L + 1.16, y + 0.19, 4.3, 0.4, t1, 15.5, TEXT, BODY, bold=False)
    txt(s, L + 5.7, y + 0.2, 5.2, 0.7, t2, 12.5, MUTED, LIGHT, line=1.4)
    y += 1.24
txt(s, L, 6.36, CW, 0.4, "内饰在这套流程里，从来不是主角。", 16, GOLD, LIGHT, spc=1.2)
foot(s, 3, "观察对象：面向消费者的整车选配器（不针对任何具体品牌）")
notes(s, "这页是立论的根。不要踩品牌，只讲结构问题。\n"
         "预判：你怎么证明？→ 我们不讲数据，只讲你去官网配一次就懂。")

# =========================================================
# 04 方案 / 数字
# =========================================================
s = new()
label(s, "03 / 我们把漏斗砍了")
head(s, "只留一件事：让你坐进去，然后随便改", 1.02, 30)
cards = [
    ("9", "类", "可点部件", "主驾 / 副驾座椅、方向盘、仪表台、左右门板、中控台、屏框、车漆"),
    ("11", "色", "内饰色板", "另有 11 色车漆，同一套交互里直接换"),
    ("4", "套", "人格预设", "沉稳商务 · 米白轻奢 · 运动红黑 · 青春气息"),
    ("0", "个", "购买按钮", "没有购物车，没有报价单，没有客服弹窗"),
]
cw, gap = 2.55, 0.41
x = L
for i, (num, unit, name, desc) in enumerate(cards):
    accent = GOLD if num != "0" else RED
    card(s, x, 2.42, cw, 2.5, fill=CARD, line_color=LINE)
    vbar(s, x, 2.42, 2.5, 0.03, accent)
    txt(s, x + 0.28, 2.66, 1.7, 0.85, num, 44, TEXT, LIGHT, spc=1)
    txt(s, x + cw - 0.78, 2.74, 0.5, 0.3, unit, 12.5, GOLD, BODY, align=PP_ALIGN.RIGHT, spc=1)
    txt(s, x + 0.28, 3.62, cw - 0.44, 0.3, name, 13.5, GOLD, BODY, spc=1.6)
    txt(s, x + 0.28, 3.98, cw - 0.48, 0.8, desc, 10.5, MUTED, LIGHT, line=1.45)
    x += cw + gap
txt(s, L, 5.4, CW, 0.9,
    "点哪一块，改哪一块；切进座舱，车顶自动让开——因为你要看的是内饰，不是车顶。",
    15, MUTED, LIGHT, line=1.6, spc=0.6)
foot(s, 4, "数据来源：项目源码 src/store.ts（PartId 9 项 / PALETTE 11 色 / PAINT_PALETTE 11 色 / PRESETS 4 套）")
notes(s, "“0 个购买按钮”是这页的题眼，念的时候加重。\n"
         "预判：没有购买按钮怎么商业化？→ 这题本来就不考商业化，考的是点子。")

# =========================================================
# 05 走一遍
# =========================================================
s = new()
label(s, "04 / 走一遍")
head(s, "从外观点进座舱，全程都是同一台车", 1.02, 30)
tw, th, g = 3.60, 2.40, 0.315
x = L
shots = [("sport.jpg", "外观 · 运动红黑"), ("int_fwd.jpg", "座舱 · 驾驶位视角"), ("fresh.jpg", "外观 · 青春气息")]
for name, cap in shots:
    framed(s, name, x, 2.26, tw, th)
    txt(s, x, 4.78, tw, 0.3, cap, 11, MUTED, BODY, spc=1.4)
    x += tw + g
txt(s, L, 5.3, CW, 0.9,
    "落地页只放名字和一句话，点「开始定制」才进 3D；\n拖拽转身、滚轮靠近，视线固定在前排两座之间。",
    14, TEXT, LIGHT, line=1.65, spc=0.6)
foot(s, 5, "实拍截图来自项目构建产物（1920×1080）")
notes(s, "这页让人相信它是真的能跑。图片是项目真实截图，不是渲染图。\n"
         "预判：手机上能用吗？→ 能，落地页四档屏高都验证过。")

# =========================================================
# 06 一个色号的距离
# =========================================================
s = new()
label(s, "05 / 一个色号的距离")
head(s, "同一台车，两种性格", 1.02, 30)
iw, ih = 5.20, 3.47
framed(s, "int_dash.jpg", L, 2.35, iw, ih)
framed(s, "int_dash_wood.jpg", W - L - iw, 2.35, iw, ih)
txt(s, L, 5.94, iw, 0.3, "奶油白仪表台　#F6EFE2", 11, MUTED, BODY, spc=1.4)
txt(s, W - L - iw, 5.94, iw, 0.3, "原木色仪表台　#A9784B", 11, MUTED, BODY, align=PP_ALIGN.RIGHT, spc=1.4)
txt(s, L + iw, 3.86, W - 2 * (L + iw), 0.6, "→", 30, GOLD, LIGHT, align=PP_ALIGN.CENTER)
txt(s, L, 6.34, CW, 0.4, "四套预设一键切换；也可以在 11 色里自己调。", 14, GOLD, LIGHT, spc=1)
foot(s, 6, "两次截图之间只改了一个部件的颜色")
notes(s, "左右两张是同一机位、同一台车，只改了仪表台一个部件——这是产品能力最直接的证据。\n"
         "预判：能改别的部件吗？→ 9 个部件都能，座椅、门板、方向盘、中控、屏框、车漆。")

# =========================================================
# 07 为什么有用
# =========================================================
s = new()
label(s, "06 / 那它到底有什么用")
head(s, "它治的不是选车，是「想坐进去」的瘾", 1.02, 30)
people = [
    ("01", "还买不起，或还不到时候", "先坐进去看看自己到底会喜欢什么，比刷一百张官图有用。"),
    ("02", "刚提了车，手还没停", "想知道还能改成什么样，再去门店下单，少一次后悔。"),
    ("03", "单纯手痒", "没有导购跟着，没有弹窗，点两下就走，不需要理由。"),
]
cw3, g3 = 3.58, 0.34
x = L
for n, t1, t2 in people:
    card(s, x, 2.5, cw3, 2.36, fill=CARD, line_color=LINE)
    txt(s, x + 0.32, 2.74, 1.0, 0.35, n, 13, GOLD, BODY, spc=1.6)
    txt(s, x + 0.32, 3.14, cw3 - 0.6, 0.8, t1, 15, TEXT, BODY, line=1.4)
    txt(s, x + 0.32, 3.96, cw3 - 0.6, 1.0, t2, 11, MUTED, LIGHT, line=1.5)
    x += cw3 + g3
txt(s, L, 5.32, CW, 0.8, "不卖车，也不导流——所以它才敢让你随便玩。", 17, GOLD, LIGHT, spc=1.4)
foot(s, 7, "“无用”是前提：它没有任何转化路径")
notes(s, "这页把“没用”翻译成“三个具体的人”。\n"
         "预判：这不就是需求调研吗？→ 不是，我们没有做过用户调研，这三类人是我们自己。")

# =========================================================
# 08 AI 深度 1：3 天
# =========================================================
s = new()
label(s, "07 / AI coding 深度使用 ①")
head(s, "3 天，25 次提交，从一个念头到能跑能拍", 1.02, 30)
days = [
    ("10-19", "6 次提交", "立项 · 建模 · 相机", "GLB 加载、座舱机位、点选换色打通"),
    ("10-20", "9 次提交", "打磨交互", "材质修复、四套预设、去掉选中描边"),
    ("10-21", "10 次提交", "交付成片", "落地页 85% 版式、双端适配、42.9s 宣传片"),
]
y = 2.5
for i, (d, c, t1, t2) in enumerate(days):
    card(s, L, y, 7.5, 1.16, fill=CARD, line_color=LINE)
    txt(s, L + 0.34, y + 0.24, 1.1, 0.4, d, 15, GOLD, BODY, spc=1.4)
    txt(s, L + 1.6, y + 0.22, 2.4, 0.35, c, 11, DIM, BODY, spc=1.2)
    txt(s, L + 3.05, y + 0.22, 4.2, 0.35, t1, 14.5, TEXT, BODY)
    txt(s, L + 3.05, y + 0.62, 4.2, 0.4, t2, 10.5, MUTED, LIGHT)
    y += 1.3
stats = [("1,624", "行源码"), ("14", "个源文件"), ("12", "个自动化脚本")]
y = 2.5
for num, name in stats:
    card(s, 8.85, y, 3.53, 1.16, fill=None, line_color=LINE)
    txt(s, 9.15, y + 0.2, 2.4, 0.6, num, 27, TEXT, LIGHT, spc=1)
    txt(s, 9.15, y + 0.76, 2.6, 0.3, name, 10.5, MUTED, BODY, spc=1.2)
    y += 1.3
txt(s, L, 6.42, CW, 0.4, "工具：WorkBuddy 智能体　｜　不是补全式使用，是“我出想法、它出实现”", 12, GOLD, BODY, spc=0.8)
foot(s, 8, "数据来源：git log 提交记录、src 目录统计（截至 2026-10-21）")
notes(s, "这页给的是“密度”：3 天做完建模、交互、落地页、双端适配和一整支片子。\n"
         "预判：3 天能做出这个？→ 代码是真的，仓库 25 次提交都在。")

# =========================================================
# 09 AI 深度 2：三件硬事
# =========================================================
s = new()
label(s, "08 / AI coding 深度使用 ②")
head(s, "AI 不只写代码，它还替我做了三件硬事", 1.02, 30)
items = [
    ("01", "证明“点了真的没反应”",
     "自己写 PNG 解码器做像素级 diff：改交互前后对比 0 / 544,000 像素变化，7 条断言全部通过。"),
    ("02", "揪出 GLB 材质串色",
     "方向盘和门板共用同一个材质实例，改门板方向盘跟着变红；按 mesh 归属 clone 拆分才解决。"),
    ("03", "绕过 0.85 fps 的算力墙",
     "机器只有软件渲染，1080p 一秒不到一帧；改走静帧 + ffmpeg 运镜，才剪出 42.9 秒的片子。"),
]
y = 2.42
for n, t1, t2 in items:
    card(s, L, y, CW, 1.24, fill=CARD, line_color=LINE)
    txt(s, L + 0.34, y + 0.2, 0.8, 0.35, n, 13, GOLD, BODY, spc=1.6)
    txt(s, L + 1.16, y + 0.2, 5.4, 0.4, t1, 15.5, TEXT, BODY)
    txt(s, L + 1.16, y + 0.62, 9.5, 0.55, t2, 11.5, MUTED, LIGHT, line=1.45)
    y += 1.36
txt(s, L, 6.5, CW, 0.4, "这些不是「生成代码」，是诊断、验证与取舍。", 13, GOLD, LIGHT, spc=1)
foot(s, 9, "对应脚本：scripts/preview-nochange.mjs、scripts/preview-landing.mjs")
notes(s, "这页是 35% 那一项真正拉开差距的地方——大部分参赛者只会写“我用 AI 生成了代码”。\n"
         "预判：0 / 544,000 是什么意思？→ 整屏 544,000 个像素点，点击前后逐个比对，一个都没变。")

# =========================================================
# 10 交付质量
# =========================================================
s = new()
label(s, "09 / 交付质量")
head(s, "能跑、能看、能验", 1.02, 30)
qual = [
    ("能跑", "React 19 + three.js + GLB（draco 压缩），桌面与手机都能开，落地页四档屏高实测占屏 84.8%–85.0%。"),
    ("能看", "42.9 秒 1080p 宣传片，中文配音与字幕逐句对位，片尾主张句定格 1 秒收尾。"),
    ("能验", "12 个自动化脚本、18 条断言；点击零变化做过像素级比对，不是口头保证。"),
]
y = 2.44
for t1, t2 in qual:
    txt(s, L, y, 1.0, 0.4, t1, 15, GOLD, BODY, spc=1.6)
    txt(s, L + 1.18, y, 4.05, 1.15, t2, 11, TEXT, LIGHT, line=1.5)
    y += 1.3
framed(s, "landing.jpg", 6.55, 2.42, 4.60, 2.59)
framed(s, "mobile.jpg", 11.30, 2.85, 1.00, 2.16)
txt(s, 6.55, 5.14, 5.8, 0.3, "桌面 1920×1080　｜　手机 390×844", 10, DIM, BODY, spc=1.2)
foot(s, 10, "验证方式：Playwright 无头浏览器 + 自写 PNG diff，非人工目测")
notes(s, "交付质量就三件事：跑得起来、看得下去、验得出来。右边两张是双端真实截图。\n"
         "预判：有 bug 吗？→ 有，中控屏边框这个部件在 GLB 里没有对应节点，点了没反应，已经写在 README。")

# =========================================================
# 11 结尾
# =========================================================
s = new()
label(s, "10 / 最后一句话", 0.9)
txt(s, L, 1.85, 10.4, 2.1, "内饰不必千篇一律。\n你的座驾，你来定风格。", 41, TEXT, LIGHT, line=1.42, spc=2.4)
bar(s, L, 4.28, 1.35)
links = [
    ("在线 Demo", "［ 提交前粘贴你的可访问链接 ］"),
    ("演示视频", "neixiu-intro-1080p.mp4　42.9s / 1920×1080"),
    ("源码", "github.com/primary-student/car-interior-configurator"),
]
y = 4.62
for k, v in links:
    txt(s, L, y, 1.5, 0.3, k, 10.5, GOLD, BODY, spc=1.4)
    txt(s, L + 1.6, y, 8.6, 0.3, v, 10.5, MUTED, BODY, spc=0.6)
    y += 0.42
txt(s, L, 6.52, CW, 0.3, "内秀 NEIXIU　·　AWS 鬼点子计划 线上赛　·　赛道一 无用之用", 10, DIM, BODY, spc=1.6)
notes(s, "收在主张句上，不要念“谢谢观看”。\n"
         "预判：为什么不干脆做个购车工具？→ 因为能做的都做了，做不了的是“让你有点想笑”。")

out = os.path.join(HERE, "内秀NEIXIU_AWS鬼点子计划_参赛PPT.pptx")
prs.save(out)
print("saved:", out, round(os.path.getsize(out) / 1048576, 2), "MB")
print("slides:", len(prs.slides.__iter__.__self__._sldIdLst))
