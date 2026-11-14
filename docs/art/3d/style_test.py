"""
居民风格样稿（用户觉得现在的 14 套「有点像乐高」，先出 3 个方向挑，不动 14 套）。

    Blender -b -P docs/art/3d/style_test.py -- <输出目录> [A B C]

三个方向 × 三个人（woman0 马尾 / oldman1 光头老头衫 / boy0 书包），每人出 <方向>-<人>-front0 / back0（宽 32）
和 <方向>-face-<人>（128×128）。只借 actors.py 的工具函数（warm / settle / turn_about / backpack ……），
它自己的输出不变；导入时把 argv 换成空目标，免得 actors.py 底部的 run() 真去渲染。

  A 软陶 / 黏土：全哑光（粗糙 0.88）、身体上窄下宽的小葫芦、扁一点的头、几大块有起伏的发束、小手掌、腿稍长带膝弯
  B Q 版动漫：头身 1:2、扁脸大眼双高光、尖角发束、两阶卡通明暗 + 1px 描边（Freestyle）、袖口 / 下摆层次和褶
  C 小比例写实：头身约 1:4、头小五官小、衣服有体积（下摆、领子、裤褶）、发型贴头自然
"""
import os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_argv = sys.argv
sys.argv = [_argv[0], '--', '/tmp/_style_test_null', '__none__']   # actors.py 导入时什么都不出
import actors
sys.argv = _argv
from actors import warm, settle, turn_about, new_objs, xform, about, shade, SKIN, SKIN_SHADE, EYE, MOUTH, BLUSH
from actors import backpack, _hairline
from lib import M, ball, box, cyl, _reset, _render_one, _model_objects
import bpy
from mathutils import Vector

WHO = ['woman0', 'oldman1', 'boy0']
WHO_CN = {'woman0': '青年女 马尾', 'oldman1': '老爷爷 光头', 'boy0': '男孩 书包'}
STYLES = {'A': '软陶 / 黏土', 'B': 'Q 版动漫', 'C': '小比例写实'}
SK = actors.SKINS

# ---------------------------------------------------------------- 体型（每个方向一套成人比例；小孩、老人在上面乘）
BODY = {
    'A': dict(thigh=0.085, shin=0.08, ankle=0.03, leg_r=0.031, ly=0.04, th=0.145, shy=0.07, ua=0.068, la=0.064,
              arm_r=0.025, hr=0.106, head_sc=(0.92, 1.0, 0.86), neck=0.016, amp=0.36, sw=0.45,
              torso=[(0.0, 0.07, 0.092), (0.22, 0.073, 0.096), (0.5, 0.064, 0.085), (0.75, 0.054, 0.074),
                     (0.92, 0.043, 0.058), (1.0, 0.022, 0.03)]),
    'B': dict(thigh=0.055, shin=0.052, ankle=0.032, leg_r=0.03, ly=0.038, th=0.11, shy=0.066, ua=0.05, la=0.046,
              arm_r=0.025, hr=0.135, head_sc=(0.84, 1.0, 0.93), neck=0.01, amp=0.36, sw=0.5,
              torso=[(0.0, 0.066, 0.084), (0.45, 0.06, 0.076), (0.8, 0.052, 0.068), (0.95, 0.04, 0.05),
                     (1.0, 0.022, 0.026)]),
    'C': dict(thigh=0.128, shin=0.122, ankle=0.026, leg_r=0.023, ly=0.03, th=0.2, shy=0.078, ua=0.098, la=0.09,
              arm_r=0.018, hr=0.074, head_sc=(0.96, 0.86, 1.06), neck=0.03, amp=0.3, sw=0.38,
              torso=[(0.0, 0.05, 0.068), (0.25, 0.046, 0.063), (0.55, 0.052, 0.074), (0.8, 0.055, 0.082),
                     (0.93, 0.045, 0.072), (1.0, 0.02, 0.026)]),
}


def body_for(style, who):
    B = dict(BODY[style])
    kind = SK[who]['body']
    if kind == 'kid':                      # 小孩：身子缩 0.65，头只缩一点
        for key in ('thigh', 'shin', 'th', 'ua', 'la'):
            B[key] *= 0.64
        for key in ('leg_r', 'arm_r', 'ly', 'shy'):
            B[key] *= 0.8
        B['torso'] = [(z, rx * 0.8, ry * 0.8) for z, rx, ry in B['torso']]
        B['hr'] *= {'A': 0.86, 'B': 0.9, 'C': 0.95}[style]
        B['neck'] *= 0.6
    if kind == 'elder':
        for key in ('thigh', 'shin', 'th'):
            B[key] *= 0.95
        B['amp'] *= 0.8; B['sw'] *= 0.7
        if style == 'B':
            B['hr'] *= 0.93
    B['lean'] = 0.03 if kind == 'elder' else 0.0
    return B


# ---------------------------------------------------------------- 几何工具：变截面管子、椭球、头发壳
def spline(keys, steps=4):
    """Catmull-Rom 插值：keys = [(点, rx, ry)]，返回加密后的列表。"""
    K = [(Vector(p), rx, ry) for p, rx, ry in keys]
    n = len(K); out = []
    for i in range(n - 1):
        p0 = K[max(i - 1, 0)][0]; p1 = K[i][0]; p2 = K[i + 1][0]; p3 = K[min(i + 2, n - 1)][0]
        for s in range(steps):
            t = s / steps
            pos = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                         + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
            out.append((pos, K[i][1] + (K[i + 1][1] - K[i][1]) * t, K[i][2] + (K[i + 1][2] - K[i][2]) * t))
    out.append(K[-1])
    return out


def tube(keys, m, ring=16, steps=4, round_ends=(True, True), up=Vector((0, 1, 0))):
    """沿一串点的变截面管子（椭圆截面，rx 在 X 一侧、ry 在 Y 一侧），两头可以是半球圆头。"""
    import bmesh
    P = spline(keys, steps) if steps > 1 else [(Vector(p), rx, ry) for p, rx, ry in keys]
    def tan(i):
        return (P[min(i + 1, len(P) - 1)][0] - P[max(i - 1, 0)][0]).normalized()
    # 圆头：两端各补几圈半球
    ext = []
    if round_ends[0]:
        c, rx, ry = P[0]; t = tan(0); r = min(rx, ry)
        for th in (80, 60, 35):
            a = math.radians(th)
            ext.append((c - t * r * math.sin(a), rx * math.cos(a), ry * math.cos(a)))
    ext += P
    if round_ends[1]:
        c, rx, ry = P[-1]; t = tan(len(P) - 1); r = min(rx, ry)
        for th in (35, 60, 80):
            a = math.radians(th)
            ext.append((c + t * r * math.sin(a), rx * math.cos(a), ry * math.cos(a)))
    P = ext
    me = bpy.data.meshes.new('tube'); o = bpy.data.objects.new('tube', me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new(); rings = []
    for i, (c, rx, ry) in enumerate(P):
        t = tan(i)
        a = up - t * up.dot(t)
        if a.length < 1e-4:
            a = Vector((1, 0, 0)) - t * t.x
        a.normalize(); b = t.cross(a)
        rings.append([bm.verts.new(c + a * (ry * math.sin(2 * math.pi * k / ring)) + b * (rx * math.cos(2 * math.pi * k / ring)))
                      for k in range(ring)])
    for i in range(len(P) - 1):
        for k in range(ring):
            bm.faces.new([rings[i][k], rings[i][(k + 1) % ring], rings[i + 1][(k + 1) % ring], rings[i + 1][k]])
    for idx in (0, len(P) - 1):
        c = sum((v.co for v in rings[idx]), Vector()) / ring
        pole = bm.verts.new(c)
        for k in range(ring):
            bm.faces.new([rings[idx][k], rings[idx][(k + 1) % ring], pole])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me); bm.free()
    o.data.materials.append(M(m) if isinstance(m, str) else m)
    return o


def ellip(C, r, sc, m, sub=4, keep=None, grow=1.0, bump=None, solid=0.0):
    """椭球（半径 r × sc），keep(dir) 只留部分顶点（头发壳），bump(dir) 半径起伏（发束的沟）。"""
    import bmesh
    me = bpy.data.meshes.new('el'); o = bpy.data.objects.new('el', me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    if keep:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co.normalized())], context='VERTS')
    for v in bm.verts:
        d = v.co.normalized()
        k = grow * (bump(d) if bump else 1.0)
        v.co = Vector(C) + Vector((d.x * sc[0], d.y * sc[1], d.z * sc[2])) * r * k
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me); bm.free()
    o.data.materials.append(M(m) if isinstance(m, str) else m)
    if solid:
        s = o.modifiers.new('sd', 'SOLIDIFY'); s.thickness = solid; s.offset = -1
    return o


def blob(p, r, sc, m, d=None, sub=3):
    """朝 d 方向摆的椭球（局部 Z 对准 d），做手掌、发束、鞋。"""
    o = ball(p[0], p[1], p[2], r, m, sub, scale=sc)
    if d is not None:
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = Vector(d).normalized().to_track_quat('Z', 'Y')
    return o


def cone(p, d, L, r, m, verts=10):
    """尖角发束：从 p 沿 d 伸出 L 长、底半径 r 的圆锥。"""
    d = Vector(d).normalized()
    o = cyl(0, 0, 0, r, L, m, verts, r2=0.0)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    o.location = Vector(p) + d * (L / 2)                    # 底面在 p，尖朝 d
    return o


# ---------------------------------------------------------------- 材质后处理
def matte(rough, spec):
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        p = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not p or p.inputs['Emission Strength'].default_value > 0.9:
            continue
        p.inputs['Roughness'].default_value = max(rough, p.inputs['Roughness'].default_value if rough < 0.8 else rough)
        p.inputs['Metallic'].default_value = 0.0
        if 'Specular IOR Level' in p.inputs:
            p.inputs['Specular IOR Level'].default_value = spec


def toonify(lo=0.62, hi_k=1.0, cut=0.42):
    """两阶卡通明暗：漫反射 → Shader to RGB → 常量色带（暗 / 亮两档）→ 自发光。"""
    for m in list(bpy.data.materials):
        if not m.node_tree:
            continue
        nt = m.node_tree
        p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not p:
            continue
        col = tuple(p.inputs['Base Color'].default_value)[:3]
        em = p.inputs['Emission Strength'].default_value
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        e = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(e.outputs[0], out.inputs[0])
        if em > 0.9:
            e.inputs[0].default_value = (*col, 1); e.inputs[1].default_value = 1.0
            continue
        d = nt.nodes.new('ShaderNodeBsdfDiffuse'); d.inputs[0].default_value = (1, 1, 1, 1)
        s2r = nt.nodes.new('ShaderNodeShaderToRGB')
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        cr = ramp.color_ramp; cr.interpolation = 'CONSTANT'
        cr.elements[0].position = 0.0
        cr.elements[0].color = (*[c * lo for c in col], 1)
        cr.elements[1].position = cut
        cr.elements[1].color = (*[min(1, c * hi_k) for c in col], 1)
        nt.links.new(d.outputs[0], s2r.inputs[0])
        nt.links.new(s2r.outputs[0], ramp.inputs[0])
        nt.links.new(ramp.outputs[0], e.inputs[0])


def outline(px, inner=True):
    sc = bpy.context.scene
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = 'ABSOLUTE'; sc.render.line_thickness = px
    vl = bpy.context.view_layer; vl.use_freestyle = True
    fs = vl.freestyle_settings
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('L')
    ls.select_by_visibility = True; ls.select_by_edge_types = True
    ls.select_silhouette = inner; ls.select_border = False; ls.select_crease = False
    ls.select_external_contour = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new('LS')
    ls.linestyle.color = (0.11, 0.06, 0.05); ls.linestyle.thickness = px


def finish(style, face=False):
    if style == 'A':
        matte(0.88, 0.15)
    elif style == 'B':
        toonify(); outline(1.5, True) if face else outline(1.0, False)
    else:
        matte(0.62, 0.3)


# ---------------------------------------------------------------- 零件
def hand(wrist, d, r, style):
    """小手掌：沿小臂方向的扁椭球 + 一个拇指。"""
    d = Vector(d).normalized()
    c = Vector(wrist) + d * r * 0.8
    blob(c, r, (0.62, 0.95, 1.05) if style != 'C' else (0.6, 0.9, 1.1), SKIN, d)
    th = c + Vector((r * 0.65, 0, r * 0.3))
    blob(th, r * 0.42, (1, 1, 1.4), SKIN, d + Vector((0.8, 0, 0)), 2)


def shoe_s(style, x, y, z, color, sole, pitch, k):
    before = set(bpy.context.scene.objects)
    if style == 'A':
        ball(x + 0.012 * k, y, z + 0.022 * k, 0.04 * k, color, 3, scale=(1.15, 0.68, 0.55))
        ball(x + 0.012 * k, y, z + 0.008 * k, 0.041 * k, sole, 3, scale=(1.17, 0.7, 0.22))
    elif style == 'B':
        ball(x + 0.014 * k, y, z + 0.026 * k, 0.045 * k, color, 3, scale=(1.1, 0.75, 0.6))
        box(x - 0.03 * k, y - 0.032 * k, z, 0.092 * k, 0.064 * k, 0.014 * k, sole, bevel=0.006 * k)
    else:
        actors.shoe(x, y, z, color, sole, 0.0, 0.07, k * 0.8)
    if pitch:
        xform(new_objs(before), about(x, y, z + 0.02, pitch, 'Y'))


# ---------------------------------------------------------------- 人
def build(style, who, frame, turn, hi=False, do_settle=True):
    warm()
    p = SK[who]; B = body_for(style, who)
    kid = p['body'] == 'kid'
    k = 0.8 if kid else 1.0
    lean = B['lean']
    sign = 0 if frame == 'idle' else (1 if frame == 0 else -1)
    amp = B['amp']
    thigh, shin, ank = B['thigh'], B['shin'], B['ankle']
    hip = ank + (thigh + shin) * (math.cos(amp) if sign else 0.985)
    lr = B['leg_r']
    # 腿：髋 → 膝 → 踝，前腿也微微屈膝（有膝盖弧度）
    for side in (1, -1):
        a = -amp * sign * side
        y = B['ly'] * side
        hp = Vector((0, y, hip))
        kn = hp + Vector((-math.sin(a), 0, -math.cos(a))) * thigh
        b = a + (0.45 if a > 0 else 0.12 if sign else 0.06)
        an = kn + Vector((-math.sin(b), 0, -math.cos(b))) * shin
        kn_out = kn + Vector((0.006 if style == 'A' else 0.0, 0, 0))
        if style == 'C':     # 裤子有体积：大腿松、膝盖一道褶、裤脚堆一点
            tube([(hp + Vector((0, 0, 0.02)), lr * 1.25, lr * 1.2), (kn_out, lr * 1.05, lr * 1.0),
                  (an + Vector((0, 0, 0.02)), lr * 0.95, lr * 0.95)], p['pants'], 14)
            cyl(kn.x, kn.y, kn.z - 0.006, lr * 1.12, 0.008, shade(p['pants'], 0.85), 14)
            cyl(an.x, an.y, an.z + 0.006, lr * 1.05, 0.016, shade(p['pants'], 0.88), 14)
        else:
            tube([(hp + Vector((0, 0, 0.02)), lr * 1.1, lr * 1.1), (kn_out, lr * 0.98, lr * 0.98),
                  (an + Vector((0, 0, 0.015)), lr * 0.9, lr * 0.9)], p['pants'], 14)
            if style == 'B':  # 卡通裤脚翻边 + 膝盖褶
                cyl(an.x, an.y, an.z + 0.008, lr * 1.08, 0.016, shade(p['pants'], 0.8), 14)
                tube([(kn + Vector((0.026 * k, -0.012, 0.012)), 0.003, 0.003), (kn + Vector((0.03 * k, 0.012, 0.006)), 0.003, 0.003)],
                     shade(p['pants'], 0.6), 6, 1)
        shoe_s(style, an.x, y, an.z - ank, p['shoe'], p['sole'], 0.3 if a > 0 else 0.0, 1.0 if not kid else 0.82)
    # 胯 + 上身
    T = B['torso']; th = B['th']
    x0 = lean * 0.3
    z0 = hip - 0.015
    tube([((x0, 0, hip - 0.035), T[0][1] * 0.92, T[0][2] * 0.92), ((x0, 0, hip + 0.03), T[0][1] * 0.95, T[0][2] * 0.95)],
         p['pants'], 18, 2, (True, False))           # 顶上不要圆头，免得从衣服里顶出来
    tank = p['extra'] == 'tank'
    tube([((x0 + lean * zf, 0, z0 + th * zf), rx, ry) for zf, rx, ry in T], p['top'], 20, 3)
    sh = z0 + th * 0.84
    rx_sh = T[-3][1]
    # 下摆层次
    hem_c = shade(p['top'], 0.85)
    if style in ('B', 'C') or p['extra'] == 'jacket':
        tube([((x0, 0, z0 - 0.002), T[0][1] * 1.06, T[0][2] * 1.05), ((x0, 0, z0 + 0.018 * k), T[0][1] * 1.05, T[0][2] * 1.04)],
             hem_c, 20, 1, (False, False))
    if tank:   # 老头衫：大领口、两个袖窿露肩
        ball(x0 + rx_sh * 0.75, 0, sh + 0.004, 0.03 if style != 'C' else 0.024, SKIN, 3, scale=(0.5, 1.3, 1.0))
    if p['extra'] == 'jacket':  # 校服外套：领子 + 拉链 + 胸前两道红条
        fz = z0 + th * 0.5
        box(x0 + T[2][1] - 0.004, -0.003, z0 + 0.01, 0.008, 0.006, th * 0.78, '#cfd3d8')
        tube([((x0 + 0.01, -0.035 * k, sh + 0.012), 0.012, 0.012), ((x0 + rx_sh * 0.85, 0, sh - 0.012), 0.012, 0.012),
              ((x0 + 0.01, 0.035 * k, sh + 0.012), 0.012, 0.012)], p['collar'], 10, 4)
        for s in (1, -1):
            box(x0 + T[2][1] - 0.006, s * 0.028 * k - 0.004, z0 + 0.02, 0.008, 0.008, th * 0.7, '#e8453c')
    if style == 'C' and p['extra'] == 'hem':   # T 恤：领口一圈 + 腰上一道横褶
        cyl(x0, 0, sh + 0.006, 0.028, 0.012, p['collar'], 16, r2=0.024)
        tube([((x0 + T[1][1] + 0.002, -0.04, z0 + th * 0.3), 0.003, 0.003),
              ((x0 + T[1][1] + 0.005, 0.0, z0 + th * 0.27), 0.003, 0.003),
              ((x0 + T[1][1] + 0.002, 0.04, z0 + th * 0.31), 0.003, 0.003)], shade(p['top'], 0.82), 6, 3)
    if style == 'B' and p['extra'] == 'hem':
        cyl(x0, 0, sh + 0.004, 0.034, 0.014, p['collar'], 16, r2=0.028)
    # 脖子
    nz = z0 + th * 0.92
    cyl(x0 + lean, 0, nz - 0.01, 0.022 * (0.8 if style == 'C' else 1) * k, B['neck'] + 0.02, SKIN, 12)
    if p.get('pack'):
        backpack(x0 - T[1][1], z0 + 0.012, sh + 0.004, p['pack'], k, x_front=x0 + T[2][1], shz=sh + 0.02)
    # 手臂
    pose = p.get('pose', 'swing')
    sleeve = p['sleeve']
    ar = B['arm_r']
    for side in (1, -1):
        shp = Vector((x0 + lean * 0.6, (T[-3][2] - ar * 0.3) * side, sh))
        if pose == 'behind':
            el = Vector((x0 - 0.035, (T[-3][2] + ar * 0.6) * side, sh - B['ua'] * 0.95))
            wr = Vector((x0 - T[1][1] - 0.02, 0.02 * side, sh - B['ua'] - B['la'] * 0.55))
        else:
            a = B['sw'] * sign * side
            lo = a - (0.35 if style != 'C' else 0.25)
            d1 = Vector((-math.sin(a), 0.12 * side, -math.cos(a))); d2 = Vector((-math.sin(lo), 0.05 * side, -math.cos(lo)))
            el = shp + d1.normalized() * B['ua']
            wr = el + d2.normalized() * B['la']
        skin_arm = SKIN
        tube([(shp, ar, ar), (el, ar * 0.9, ar * 0.9), (wr, ar * 0.78, ar * 0.78)], skin_arm, 12)
        if sleeve != 'none':
            cut = 0.6 if sleeve == 'short' else 1.0
            end = shp + (el - shp) * cut if sleeve == 'short' else wr - (wr - el).normalized() * 0.008
            mid = shp + (end - shp) * 0.5 if sleeve == 'short' else el
            flare = 1.3 if style == 'B' else 1.12 if style == 'C' else 1.06
            tube([(shp + Vector((0, 0, 0.008)), ar * 1.25, ar * 1.25), (mid, ar * 1.15, ar * 1.15), (end, ar * flare, ar * flare)],
                 p['top'], 14, 3, (True, False))
            if style in ('B', 'C') or sleeve == 'long':   # 袖口一圈
                dd = (end - mid).normalized()
                tube([(end - dd * 0.006, ar * flare * 1.04, ar * flare * 1.04), (end + dd * 0.004, ar * flare * 1.04, ar * flare * 1.04)],
                     shade(p['top'], 0.8), 14, 1, (False, False))
        else:
            ball(shp.x, shp.y, shp.z, ar * 1.05, SKIN, 3)
        hand(wr, wr - el, ar * (1.25 if style == 'B' else 1.05), style)
    # 头
    hr = B['hr']; hs = B['head_sc']
    hx = x0 + lean * 1.3
    hz = nz + B['neck'] + hr * hs[2] * 0.9
    C = Vector((hx, 0, hz))
    objs = head(style, who, C, hr, hs, hi)
    turn_about(objs, hx, 0, -0.35)
    if do_settle:
        settle('style', turn)
    return {'C': C, 'hr': hr * max(hs)}


def head(style, who, C, hr, hs, hi):
    before = set(bpy.context.scene.objects)
    p = SK[who]
    sub = 5 if hi else 4
    rx, ry, rz = hr * hs[0], hr * hs[1], hr * hs[2]
    P = lambda az, el, kk=1.0: C + Vector((math.cos(az) * math.cos(el) * rx, math.sin(az) * math.cos(el) * ry,
                                          math.sin(el) * rz)) * kk
    sm = M(SKIN, rough=0.6)
    ellip(C, hr, hs, sm, sub)
    for s in (1, -1):                                   # 耳朵
        e = P(1.5 * s, -0.1, 0.97)
        ball(e.x, e.y, e.z, hr * (0.17 if style == 'C' else 0.2), SKIN, 2, scale=(0.7, 0.45, 1.0))
    eye_el = {'A': -0.05, 'B': -0.14, 'C': 0.0}[style]
    elder = p['body'] == 'elder'
    hair = p['hair']
    brow = '#d8d2c8' if elder else shade(hair, 0.8)
    for s in (1, -1):
        e = P(0.36 * s if style != 'C' else 0.33 * s, eye_el, 1.0)
        if style == 'A':      # 黏土：小椭圆豆豆眼 + 一点高光
            ball(e.x, e.y, e.z, hr * 0.13, EYE, 2, scale=(0.4, 0.75, 1.05))
            ball(e.x + 0.005, e.y - 0.004, e.z + hr * 0.04, hr * 0.04, M('#ffffff', emit=1.2), 1)
        elif style == 'B':    # 动漫大眼：深色眼眶 + 棕色瞳孔下半 + 两个高光 + 上眼线
            ball(e.x, e.y, e.z, hr * 0.22, EYE, 3, scale=(0.32, 0.74, 1.2))
            ball(e.x + 0.004, e.y, e.z - hr * 0.07, hr * 0.15, '#7a4a30', 2, scale=(0.32, 0.8, 0.8))
            ball(e.x + 0.008, e.y - 0.008 * s - 0.004, e.z + hr * 0.08, hr * 0.075, M('#ffffff', emit=1.3), 2)
            ball(e.x + 0.008, e.y + 0.008 * s, e.z - hr * 0.1, hr * 0.035, M('#ffffff', emit=1.3), 1)
            l = P(0.36 * s, eye_el + 0.23, 1.0)
            box(l.x - 0.004, l.y - hr * 0.13, l.z - 0.004, 0.01, hr * 0.26, hr * 0.06, EYE, rot=(-0.15 * s, 0, 0))
        else:                 # 写实：小黑眼 + 小高光
            ball(e.x, e.y, e.z, hr * 0.1, EYE, 2, scale=(0.4, 0.8, 0.9))
            ball(e.x + 0.003, e.y - 0.002, e.z + hr * 0.03, hr * 0.03, M('#ffffff', emit=1.0), 1)
        b = P(0.37 * s, eye_el + (0.3 if style != 'B' else 0.42), 1.02)
        bw = {'A': 0.13, 'B': 0.07, 'C': 0.07}[style]
        box(b.x - 0.005, b.y - hr * 0.15, b.z - 0.003, 0.01, hr * 0.3, hr * bw, brow, rot=(0.15 * s, 0, 0))
        if style != 'C':
            c = P(0.66 * s, eye_el - 0.25, 0.99)
            ball(c.x, c.y, c.z, hr * 0.15, M(BLUSH, rough=0.9), 2, scale=(0.4, 1, 0.6))
    # 嘴：小弧线
    mz = {'A': -0.38, 'B': -0.46, 'C': -0.36}[style]
    w = {'A': 0.12, 'B': 0.09, 'C': 0.1}[style]
    for i in range(5):
        t = (i - 2) / 2
        m = P(t * w, mz + t * t * 0.05, 1.0)
        ball(m.x, m.y, m.z, hr * (0.04 if style != 'C' else 0.03), MOUTH if style != 'C' else '#a8524a', 2)
    if style != 'B':
        n = P(0.0, (mz + eye_el) / 2 - 0.02, 1.0)
        ball(n.x, n.y, n.z, hr * (0.09 if style == 'A' else 0.08), SKIN_SHADE, 2, scale=(0.9, 0.8, 1.0 if style == 'A' else 1.3))
    hair_fn = {'woman0': hair_ponytail, 'oldman1': hair_bald, 'boy0': hair_bowl}[who]
    hair_fn(style, C, hr, hs, P, p, sub)
    return new_objs(before)


def _az(d):
    return math.atan2(d.y, d.x)


def ridges(n, depth, sharp=1.0):
    """沿方位角的发束起伏（从头顶放射出来的沟）。"""
    def f(d):
        v = abs(math.sin(_az(d) * n / 2)) ** sharp
        return 1 + depth * v * max(0.0, 1 - max(0.0, d.z) ** 4)
    return f


def hair_ponytail(style, C, hr, hs, P, p, sub):
    hm = M(p['hair'], rough=0.5); hl = M(shade(p['hair'], 1.3), rough=0.5); hd = M(shade(p['hair'], 0.7), rough=0.5)
    tie = M(p.get('tie', '#e0334f'), rough=0.5)
    back = P(math.pi, 0.45, 1.05)
    if style == 'A':
        ellip(C, hr, hs, hm, sub, _hairline(0.5, -0.45, -0.6), 1.06, ridges(9, 0.05, 0.6))
        for i, az in enumerate((-0.75, -0.2, 0.4)):     # 三大块刘海，往一边扫
            q = P(az, 0.56, 1.04)
            blob(q, hr * 0.3, (0.55, 1.0, 0.72), hm, Vector((math.cos(az), math.sin(az), 0.6)) + Vector((0, 0.5, 0)))
        for s in (1, -1):                               # 两侧鬓发：一束垂到下巴
            q = P(1.12 * s, -0.25, 1.06)
            tube([(P(1.0 * s, 0.25, 1.04), hr * 0.13, hr * 0.15), (q, hr * 0.12, hr * 0.13),
                  (q + Vector((0.01, 0.01 * s, -hr * 0.35)), hr * 0.06, hr * 0.07)], hm, 12)
        ball(back.x, back.y, back.z, hr * 0.13, tie, 2)
        tube([(back + Vector((-hr * 0.05, 0, 0)), hr * 0.2, hr * 0.22), (back + Vector((-hr * 0.4, 0, -hr * 0.3)), hr * 0.27, hr * 0.27),
              (back + Vector((-hr * 0.5, 0, -hr * 0.85)), hr * 0.2, hr * 0.22), (back + Vector((-hr * 0.38, 0, -hr * 1.25)), hr * 0.08, hr * 0.09)],
             hm, 14, 4)
    elif style == 'B':
        ellip(C, hr, hs, hm, sub, _hairline(0.45, -0.4, -0.6), 1.06, ridges(12, 0.035, 2))
        ellip(C, hr, hs, hl, sub, lambda d: 0.55 < d.z < 0.72 and d.x < 0.5, 1.075)   # 头顶高光环
        for i in range(6):                              # 尖刘海
            az = -0.85 + i * 0.32
            q = P(az, 0.72, 1.02)
            cone(q, Vector((math.cos(az) * 1.0, math.sin(az) * 0.3, -0.8)), hr * (0.38 if i % 2 else 0.48), hr * 0.16, hm)
        for s in (1, -1):
            q = P(1.1 * s, 0.3, 1.03)
            cone(q, Vector((0.15, 0.25 * s, -1)), hr * 0.85, hr * 0.17, hm)
        ball(back.x, back.y, back.z, hr * 0.12, tie, 2)
        tube([(back, hr * 0.17, hr * 0.2), (back + Vector((-hr * 0.4, 0, -hr * 0.25)), hr * 0.22, hr * 0.25),
              (back + Vector((-hr * 0.5, 0, -hr * 0.75)), hr * 0.12, hr * 0.14), (back + Vector((-hr * 0.35, 0, -hr * 1.15)), 0.002, 0.002)],
             hm, 12, 4, (True, False))
        cone(back + Vector((-hr * 0.45, 0, -hr * 0.4)), Vector((-0.6, 0.3, -1)), hr * 0.55, hr * 0.1, hm)
        cone(back + Vector((-hr * 0.45, 0, -hr * 0.4)), Vector((-0.4, -0.5, -1)), hr * 0.5, hr * 0.09, hm)
    else:
        ellip(C, hr, hs, hm, sub, _hairline(0.48, -0.4, -0.6), 1.045, ridges(16, 0.015))
        q = P(-0.25, 0.45, 1.03)
        blob(q, hr * 0.45, (0.4, 1.0, 0.45), hm, Vector((0.7, 0.6, 0.5)))      # 斜分刘海
        for s in (1, -1):
            tube([(P(1.15 * s, 0.25, 1.03), hr * 0.08, hr * 0.09), (P(1.2 * s, -0.4, 1.05), hr * 0.06, hr * 0.07)], hm, 10)
        ball(back.x, back.y, back.z, hr * 0.1, tie, 2)
        tube([(back, hr * 0.13, hr * 0.15), (back + Vector((-hr * 0.35, 0, -hr * 0.3)), hr * 0.17, hr * 0.18),
              (back + Vector((-hr * 0.4, 0, -hr * 1.0)), hr * 0.12, hr * 0.13), (back + Vector((-hr * 0.3, 0, -hr * 1.5)), hr * 0.04, hr * 0.05)],
             hm, 12, 4)
        ellip(C, hr, hs, hl, sub, lambda d: 0.6 < d.z < 0.75 and d.x < 0.3 and d.y < 0.3, 1.055)


def hair_bald(style, C, hr, hs, P, p, sub):
    wm = M(p['hair'], rough=0.8)
    if style == 'A':      # 耳后到后脑几团白发
        for az in (1.5, 2.2, 2.85, -2.85, -2.2, -1.5):
            q = P(az, -0.05, 1.02)
            blob(q, hr * 0.24, (0.55, 1.0, 0.75), wm, Vector((math.cos(az), math.sin(az), 0)))
    elif style == 'B':    # 两侧翘起的白毛 + 光头一块卡通高光
        for s in (1, -1):
            for j, (el, L) in enumerate(((0.15, 0.5), (-0.1, 0.45), (0.35, 0.35))):
                q = P(1.55 * s + 0.25 * s * j, el, 1.0)
                cone(q, Vector((-0.9, 0.5 * s, 0.4 + el)), hr * L * 0.35, hr * 0.12, wm)
        ellip(C, hr, hs, M('#fff4e2', emit=1.0), sub, lambda d: d.z > 0.8 and d.x > -0.1 and d.y < 0.15 and d.y > -0.35, 1.01)
    else:                 # 一圈短短的白发
        ellip(C, hr, hs, wm, sub, lambda d: d.x < 0.1 and -0.45 < d.z < 0.18 and not (d.x > -0.25 and abs(d.y) < 0.7),
              1.03, ridges(20, 0.02))
    # 白眉毛加粗一点（老人特征）
    for s in (1, -1):
        b = P(0.37 * s, {'A': 0.27, 'B': 0.3, 'C': 0.32}[style], 1.03)
        ball(b.x, b.y, b.z, hr * 0.09, wm, 2, scale=(0.6, 1.6, 0.6))


def hair_bowl(style, C, hr, hs, P, p, sub):
    hm = M(p['hair'], rough=0.5); hl = M(shade(p['hair'], 1.45), rough=0.5)
    if style == 'A':
        ellip(C, hr, hs, hm, sub, _hairline(0.52, -0.15, -0.5), 1.07, ridges(10, 0.06, 0.7))
        for i in range(5):                              # 一块块圆刘海
            az = -0.85 + i * 0.42
            blob(P(az, 0.52, 1.04), hr * 0.26, (0.55, 1.0, 0.8), hm, Vector((math.cos(az), math.sin(az), 0.3)))
        for s in (1, -1):
            blob(P(1.3 * s, -0.08, 1.03), hr * 0.2, (0.6, 0.7, 1.2), hm, Vector((0, s, 0)))
    elif style == 'B':
        ellip(C, hr, hs, hm, sub, _hairline(0.5, -0.15, -0.5), 1.06, ridges(12, 0.04, 2))
        ellip(C, hr, hs, hl, sub, lambda d: 0.55 < d.z < 0.7 and d.x < 0.5, 1.075)
        for i in range(6):
            az = -0.9 + i * 0.36
            cone(P(az, 0.72, 1.02), Vector((math.cos(az) * 1.0, math.sin(az) * 0.4, -0.8)), hr * (0.36 if i % 2 else 0.46), hr * 0.16, hm)
        for az, el in ((math.pi, 0.7), (2.4, 0.6), (-2.4, 0.6), (math.pi, 0.2), (0.3, 0.95)):
            q = P(az, el, 1.02)
            cone(q, Vector((math.cos(az) * 0.9, math.sin(az) * 0.6, 0.8)), hr * 0.45, hr * 0.17, hm)
        for s in (1, -1):
            cone(P(1.3 * s, 0.2, 1.02), Vector((0.1, 0.3 * s, -1)), hr * 0.55, hr * 0.16, hm)
    else:
        ellip(C, hr, hs, hm, sub, _hairline(0.5, -0.1, -0.5), 1.04, ridges(18, 0.02))
        blob(P(-0.15, 0.48, 1.03), hr * 0.42, (0.35, 1.0, 0.4), hm, Vector((0.8, 0.3, 0.4)))
        for s in (1, -1):
            blob(P(1.3 * s, 0.0, 1.03), hr * 0.13, (0.5, 0.5, 1.2), hm, Vector((0, s, 0)))


# ---------------------------------------------------------------- 出图
def street(style, who, frame, turn):
    build(style, who, frame, turn)
    finish(style)


def face_shot(style, who, out_dir):
    _reset()
    info = build(style, who, 'idle', False, hi=True, do_settle=False)
    finish(style, face=True)
    C, hr = info['C'], info['hr']
    sc = bpy.context.scene
    sun = bpy.data.objects['_sun']
    sun.rotation_mode = 'QUATERNION'
    sun.rotation_quaternion = Vector((0.7, -0.75, 0.85)).normalized().to_track_quat('Z', 'Y')
    sun.data.energy = 2.3; sun.data.angle = math.radians(12)
    bpy.ops.object.light_add(type='SUN')
    rim = bpy.context.object
    rim.rotation_mode = 'QUATERNION'
    rim.rotation_quaternion = Vector((-0.9, 0.5, 0.5)).normalized().to_track_quat('Z', 'Y')
    rim.data.energy = 1.4; rim.data.color = (1.0, 0.92, 0.8); rim.data.use_shadow = False
    el = math.radians(14)
    dc = Vector((math.cos(el), 0, math.sin(el)))
    S = hr * 2.3 / 0.62
    bpy.ops.object.camera_add()
    cam = bpy.context.object; sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = S
    q = dc.to_track_quat('Z', 'Y')
    cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = q
    cam.location = C + (q @ Vector((0, 1, 0))) * (S * 0.02) + dc * 5
    cam.data.clip_start = 0.1; cam.data.clip_end = 20
    sc.render.resolution_x = sc.render.resolution_y = 128
    sc.render.resolution_percentage = 100
    sc.render.filter_size = 1.5
    sc.eevee.taa_render_samples = 128
    sc.render.filepath = os.path.join(out_dir, f'{style}-face-{who}.png')
    bpy.ops.render.render(write_still=True)
    print(f'[ok] {style}-face-{who}.png 128×128')


actors.SETTLE['style'] = None          # 样稿：自动贴底，打印需要多少


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = os.path.abspath(argv[0] if argv else '.')
    only = set(argv[1:]) or set(STYLES)
    os.makedirs(out, exist_ok=True)
    for st in STYLES:
        if st not in only:
            continue
        for who in WHO:
            for fr, turn, d in ((0, False, 'front0'), (0, True, 'back0')):
                _render_one(f'{st}-{who}-{d}', 0, 0, lambda st=st, who=who, fr=fr, turn=turn: street(st, who, fr, turn),
                            False, out, 32)
            face_shot(st, who, out)


main()
