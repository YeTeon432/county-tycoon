"""地形上立起来的物件（D021）：行道树、树林、山、荷叶。不铺院子（底下是地面图块），都不出 _r。

    Blender -b -P docs/art/3d/terrain_obj.py -- <输出目录> [名字...]
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *


def _flat(o):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.shade_flat()
    return o


def round_tree(x, y, s=1.0, z=0.0, seed=0, light='leaf_light', dark='leaf'):
    """阔叶树：树干 + 三四团树冠，随机一点错落。"""
    rnd = random.Random(seed)
    cyl(x, y, z, 0.045 * s, 0.34 * s, 'trunk', 8)
    ball(x, y, z + 0.5 * s, 0.25 * s, dark)
    for k in range(3):
        a = rnd.random() * 6.28
        ball(x + math.cos(a) * 0.1 * s, y + math.sin(a) * 0.1 * s, z + (0.58 + 0.06 * rnd.random()) * s,
             (0.15 + 0.04 * rnd.random()) * s, light)
    ball(x + 0.06 * s, y - 0.06 * s, z + 0.7 * s, 0.13 * s, light)


def pine(x, y, s=1.0, z=0.0):
    cyl(x, y, z, 0.035 * s, 0.18 * s, 'trunk', 8)
    for i, (r, hh) in enumerate([(0.2, 0.28), (0.16, 0.26), (0.11, 0.24)]):
        _flat(cyl(x, y, z + (0.12 + i * 0.15) * s, r * s, hh * s, 'pine', 8, r2=0.0))


# ---------------------------------------------------------------- 行道树
@sprite('tree', 1, 1, facing=False)
def tree_big():
    """行道树：一棵大圆冠树 + 方形小树池。"""
    box(0.36, 0.36, 0, 0.28, 0.28, 0.035, 'curb')
    box(0.39, 0.39, 0.035, 0.22, 0.22, 0.002, M('#7a5a3a'))
    s = 1.0
    cyl(0.5, 0.5, 0, 0.06, 0.75, 'trunk', 10)
    for (dx, dy, dz, r, m) in [(0, 0, 0.95, 0.36, 'leaf'), (0.14, -0.12, 1.05, 0.24, 'leaf_light'),
                               (-0.15, 0.1, 1.12, 0.24, 'leaf_light'), (0.05, 0.12, 1.25, 0.22, 'leaf'),
                               (-0.05, -0.1, 1.3, 0.2, 'leaf_light')]:
        ball(0.5 + dx, 0.5 + dy, dz, r, m)


# ---------------------------------------------------------------- 树林
FORESTS = [
    # (kind, x, y, scale)
    [('r', 0.32, 0.32, 0.9), ('r', 0.7, 0.35, 0.7), ('r', 0.35, 0.72, 0.75), ('p', 0.68, 0.7, 0.85)],
    [('r', 0.5, 0.5, 1.05), ('r', 0.25, 0.25, 0.6), ('r', 0.78, 0.25, 0.55), ('r', 0.25, 0.78, 0.6)],
    [('p', 0.3, 0.3, 0.9), ('r', 0.7, 0.3, 0.8), ('p', 0.3, 0.72, 0.7), ('r', 0.58, 0.64, 0.9), ('p', 0.82, 0.75, 0.6)],
    [('r', 0.28, 0.5, 0.7), ('r', 0.55, 0.25, 0.65), ('r', 0.62, 0.62, 0.95), ('p', 0.25, 0.22, 0.6),
     ('r', 0.8, 0.45, 0.5)],
]


def _forest(i):
    def fn():
        rnd = random.Random(100 + i)
        # 按从后往前的顺序摆，后面的先画
        for k, (kind, x, y, s) in enumerate(sorted(FORESTS[i], key=lambda t: -(t[2] - t[1]))):
            if kind == 'p':
                pine(x, y, s)
            else:
                pal = rnd.choice([('leaf_light', 'leaf'), ('leaf', 'leaf_dark'), ('#7cc84e', 'leaf_light')])
                round_tree(x, y, s, 0, seed=k + 10 * i, light=pal[0], dark=pal[1])
        for _ in range(3):
            bx, by = 0.15 + rnd.random() * 0.7, 0.15 + rnd.random() * 0.7
            bush(bx, by, 0.05 + 0.03 * rnd.random(), 0, 'leaf_dark')
    return fn


for _i in range(4):
    sprite(f'terrain-forest-{_i}', 1, 1, facing=False)(_forest(_i))


# ---------------------------------------------------------------- 山
def heightfield(peaks, seed, N=9, grass_below=0.18, rock=('#a88b6c', '#957a60', '#b9a07f'), cap=None):
    """整格菱形底座的低多边形山：边上高度 0，peaks=[(px,py,高,半径)]。按坡度 / 高度上色。"""
    import bmesh
    rnd = random.Random(seed)
    H = max(p[2] for p in peaks)
    pts = {}
    for i in range(N + 1):
        for j in range(N + 1):
            x, y = i / N, j / N
            if 0 < i < N and 0 < j < N:
                x += (rnd.random() - 0.5) * 0.6 / N; y += (rnd.random() - 0.5) * 0.6 / N
            z = 0.0
            for px, py, ph, pr in peaks:
                d = math.hypot(x - px, y - py) / pr
                z = max(z, ph * max(0.0, 1 - d) ** 1.25)
            edge = min(x, y, 1 - x, 1 - y)
            z *= min(1.0, edge / 0.12)
            if 0 < i < N and 0 < j < N:
                z *= 0.88 + 0.24 * rnd.random()
            else:
                z = 0.0
            pts[i, j] = (x, y, z)
    me = bpy.data.meshes.new('mtn'); o = bpy.data.objects.new('mtn', me)
    bpy.context.collection.objects.link(o)
    mats = [M(c) for c in rock] + [M('#5fae45'), M('#4c9a3c'), M('#7fc456')]
    for m in mats:
        o.data.materials.append(m)
    bm = bmesh.new()
    vs = {k: bm.verts.new(v) for k, v in pts.items()}
    for i in range(N):
        for j in range(N):
            a, b, c, d = vs[i, j], vs[i + 1, j], vs[i + 1, j + 1], vs[i, j + 1]
            for tri in ((a, b, c), (a, c, d)) if (i + j) % 2 else ((a, b, d), (b, c, d)):
                f = bm.faces.new(tri)
                zc = sum(v.co.z for v in tri) / 3
                f.normal_update()
                nz = abs(f.normal.z)
                if zc < grass_below * H or (nz > 0.82 and zc < 0.55 * H):
                    f.material_index = 3 + rnd.randrange(3)
                elif cap and zc > cap * H and nz > 0.6:
                    f.material_index = 3 + rnd.randrange(2)
                else:
                    f.material_index = rnd.randrange(3)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = False
    return o, (lambda x, y: _height(pts, N, x, y))


def _height(pts, N, x, y):
    i = min(N - 1, int(x * N)); j = min(N - 1, int(y * N))
    return max(pts[i, j][2], pts[i + 1, j][2], pts[i, j + 1][2], pts[i + 1, j + 1][2]) * 0.8


@sprite('terrain-mountain-0', 1, 1, facing=False)
def mountain0():
    """矮山包：圆一点，绿多石少，坡上几棵树。"""
    _, hz = heightfield([(0.5, 0.52, 0.42, 0.62), (0.3, 0.35, 0.25, 0.4)], 1, grass_below=0.45, cap=0.6)
    for (x, y, s) in [(0.72, 0.3, 0.45), (0.28, 0.7, 0.5), (0.66, 0.68, 0.4)]:
        round_tree(x, y, s, hz(x, y) * 0.85, seed=int(x * 100))
    bush(0.25, 0.2, 0.05, 0.02, 'leaf_dark')


@sprite('terrain-mountain-1', 1, 1, facing=False)
def mountain1():
    """中等石山：单峰，岩石为主，山脚一圈绿，顶上一点绿。"""
    _, hz = heightfield([(0.48, 0.55, 0.72, 0.6), (0.7, 0.35, 0.35, 0.35)], 7, grass_below=0.16, cap=0.85)
    pine(0.25, 0.25, 0.45, hz(0.25, 0.25) * 0.8)
    pine(0.8, 0.72, 0.4, hz(0.8, 0.72) * 0.8)
    bush(0.75, 0.15, 0.05, 0.01, 'leaf')


@sprite('terrain-mountain-2', 1, 1, facing=False)
def mountain2():
    """高石山：双峰，陡，坡上几块绿和小松。"""
    _, hz = heightfield([(0.42, 0.6, 1.0, 0.58), (0.68, 0.4, 0.62, 0.42)], 13, N=10, grass_below=0.12, cap=0.9)
    for (x, y, s) in [(0.22, 0.3, 0.45), (0.8, 0.2, 0.35), (0.3, 0.82, 0.35)]:
        pine(x, y, s, hz(x, y) * 0.8)


# ---------------------------------------------------------------- 荷叶
def lily_pad(x, y, r, rot, m, z=0.004):
    """荷叶：缺一个楔口的扁圆片 + 叶脉中心点。"""
    n = 18; gap = 0.5
    pts = [(x, y)]
    for k in range(n + 1):
        a = rot + gap / 2 + k * (2 * math.pi - gap) / n
        pts.append((x + r * math.cos(a), y + r * math.sin(a)))
    import bmesh
    me = bpy.data.meshes.new('pad'); o = bpy.data.objects.new('pad', me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    lo = [bm.verts.new((px, py, z)) for px, py in pts]
    hi = [bm.verts.new((px, py, z + 0.012)) for px, py in pts]
    for k in range(1, len(pts) - 1):
        bm.faces.new([lo[0], lo[k + 1], lo[k]]); bm.faces.new([hi[0], hi[k], hi[k + 1]])
    ring = list(range(len(pts)))
    for a, b in zip(ring, ring[1:] + ring[:1]):
        bm.faces.new([lo[a], lo[b], hi[b], hi[a]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o.data.materials.append(M(m) if isinstance(m, str) else m)
    cyl(x, y, z + 0.012, r * 0.12, 0.002, 'leaf_dark', 8)


@sprite('terrain-pond-lily', 1, 1, facing=False)
def pond_lily():
    """池塘上漂着的几片荷叶 + 一朵粉荷花 + 一个花苞。"""
    pads = [(0.42, 0.45, 0.11, 0.3, 'leaf_light'), (0.62, 0.36, 0.08, 2.0, 'leaf'), (0.6, 0.62, 0.1, 4.0, '#6cc04a'),
            (0.3, 0.62, 0.07, 1.2, 'leaf'), (0.74, 0.52, 0.06, 5.2, 'leaf_light'), (0.36, 0.28, 0.06, 3.1, '#6cc04a')]
    for x, y, r, rot, m in pads:
        lily_pad(x, y, r, rot, m)
    # 荷花
    fx, fy, fz = 0.5, 0.52, 0.02
    pink = M('#ee6f9a'); pink2 = M('#f7a8c2')
    for k in range(8):
        a = k * math.pi / 4
        o = ball(fx + 0.045 * math.cos(a), fy + 0.045 * math.sin(a), fz + 0.04, 0.042, pink if k % 2 else pink2, 2,
                 scale=(1.0, 0.55, 1.4))
        o.rotation_euler = (0, 0, a + math.pi / 2)
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.3
        ball(fx + 0.02 * math.cos(a), fy + 0.02 * math.sin(a), fz + 0.06, 0.028, pink2, 2, scale=(1, 0.6, 1.4))
    cyl(fx, fy, fz + 0.06, 0.018, 0.03, 'yellow', 10)
    # 花苞
    cyl(0.66, 0.42, 0.0, 0.006, 0.06, 'leaf_dark', 6)
    ball(0.66, 0.42, 0.075, 0.022, pink, 2, scale=(1, 1, 1.5))


if __name__ == '__main__':
    run()
