"""T540：把出图脚本里的楼导成 3D 模型（.glb），给游戏实时渲染用（D033）。

    Blender -b -P docs/art/3d/export_glb.py -- <输出目录> <脚本名> [楼名...]

例：Blender -b -P docs/art/3d/export_glb.py -- /tmp/glb homes_shops supermarket house

做法：照常跑出图脚本里登记的建模函数（含背面自动补窗），然后
  1. 文字转网格、修改器（倒角）应用掉；
  2. 全部合成一个网格，材质只留底色，写进顶点色；按普通表面、招牌灯、玻璃和带局部日照的住宅立面分子网格；
  3. Cycles 烘环境光遮蔽，乘进顶点色；
  4. 坐标换成 Cocos 习惯（Y 朝上）由 glTF 导出器自动做；原点 = 占地左上角 (0,0,0)，1 单位 = 1 格。
打印每栋楼的三角面数。
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
argv = sys.argv[sys.argv.index('--') + 1:]
out_dir, script, only = os.path.abspath(argv[0]), argv[1], set(argv[2:])

import lib
lib.run = lambda: None                      # 只登记，不渲染

# ---- 减面（实时渲染用，楼是从 ~60 米外看的，小倒角、高精度圆看不出来）
_box, _cyl, _ball, _text = lib.box, lib.cyl, lib.ball, lib.text
def _box_lo(x, y, z, sx, sy, sz, m, bevel=0.0, rot=None):
    """为有倒角的楼体或宽板保留一段折面，薄檐的圆角半径按板厚限制。"""
    big = bevel and sorted((sx, sy, sz))[1] > 0.2
    o = _box(x, y, z, sx, sy, sz, m, bevel=min(max(bevel, 0.012), 0.25 * min(sx, sy, sz)) if big else 0.0, rot=rot)
    if big:
        o.modifiers['bv'].segments = 1
    return o
lib.box = _box_lo
lib.cyl = lambda x, y, z, r, h, m, verts=24, **k: _cyl(x, y, z, r, h, m, max(6, min(verts, 10 if r > 0.1 else 6)), **k)
lib.ball = lambda x, y, z, r, m, sub=3, **k: _ball(x, y, z, r, m, 2 if r >= 0.1 else 1, **k)   # 树冠这种大球要圆，1 级细分是多边形块
def _text_lo(*a, **k):
    o = _text(*a, **k)
    o.data.resolution_u = 1
    o.data.extrude = min(o.data.extrude, 0.004)   # 薄一点省面，但要有正面（拍成 0 只剩一个朝后的面，发黑）
    return o
lib.text = _text_lo

__import__(script)

import bpy


def _base_color(m):
    if not m or not m.use_nodes:
        return (1, 1, 1, 1)
    p = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not p:
        return (1, 1, 1, 1)
    c = list(p.inputs['Base Color'].default_value)
    e = p.inputs['Emission Strength'].default_value if 'Emission Strength' in p.inputs else 0
    return (*c[:3], 1.0)


def _emissive(m):
    if not m or not m.use_nodes:
        return False
    p = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    return bool(p and p.inputs['Emission Strength'].default_value > 0)


def _bake_ao(o):
    """环境光遮蔽烘进顶点色（墙角、窗洞、楼脚变暗，和预渲染图的 Eevee 一样「有体积」）。
    底下垫一块临时地面，楼脚才会有接地的暗边。"""
    import bpy
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.001))
    ground = bpy.context.object
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 64
    sc.cycles.device = 'CPU'
    sc.world.light_settings.distance = 0.35
    ao = o.data.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
    o.data.color_attributes.active_color = ao
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    col = o.data.color_attributes['Col']
    emit_idx = 1
    for poly in o.data.polygons:
        if poly.material_index == emit_idx:
            continue
        for li in poly.loop_indices:
            a = ao.data[li].color[0]
            a = 0.45 + 0.55 * a                      # 不要压成全黑：最暗留 45%
            c = col.data[li].color
            col.data[li].color = (c[0] * a, c[1] * a, c[2] * a, c[3])
    # Cocos 的 builtin 着色器把顶点色当 sRGB（SRGBToLinear），glTF 导出的是线性值 → 这里先转成 sRGB，不然偏深偏艳
    def srgb(x):
        return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
    for d in col.data:
        c = d.color
        d.color = (srgb(c[0]), srgb(c[1]), srgb(c[2]), c[3])
    o.data.color_attributes.remove(o.data.color_attributes['AO'])
    o.data.color_attributes.active_color = o.data.color_attributes['Col']
    bpy.data.objects.remove(ground)


def bake_balcony_sun(obj, depsgraph, colors):
    """顶点 alpha 的低四位分别记录四个摆放朝向的日光可见度，供着色器逐顶点解码。"""
    from mathutils import Vector
    mesh = obj.data
    # 与 World3D 中固定的日光 (-54°, 98°) 对齐。Blender 的高度轴为 Z。
    sx, sy, sz = 0.582065, 0.081804, 0.809017
    rays = [Vector((x, y, sz)) for x, y in ((sx, sy), (sy, -sx), (-sx, -sy), (-sy, sx))]
    normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
    cache = {}
    kinds = {'glass': 0, 'metal': 1, 'brick': 2, 'wall': 3}
    for face in mesh.polygons:
        finish = mesh.materials[face.material_index].get('housing_finish')
        if not finish:
            continue
        center = obj.matrix_world @ face.center
        normal = (normal_matrix @ face.normal).normalized()
        for li in face.loop_indices:
            point = obj.matrix_world @ mesh.vertices[mesh.loops[li].vertex_index].co
            # 棱边处从面内稍向内取样，避免把同一堵墙判断为遮挡物。
            origin = point.lerp(center, 0.025) + normal * 0.001
            key = (*origin.to_tuple(5), *normal.to_tuple(4))
            if key not in cache:
                visible = 0
                for turn, ray in enumerate(rays):
                    if normal.dot(ray) <= 0 or not bpy.context.scene.ray_cast(depsgraph, origin, ray, distance=5)[0]:
                        visible |= 1 << turn
                cache[key] = visible
            # 高两位恒为 1，兼容预览的普通顶点色。接下来的两位区分表面材质。
            colors.data[li].color[3] = (192 + kinds[finish] * 16 + cache[key]) / 255


def export(name, w, h, fn):
    lib._reset()
    fn()
    lib._auto_back()
    bpy.context.view_layer.update()
    objs = lib._model_objects()
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')          # 文字 → 网格，修改器应用掉
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    lit = bpy.data.materials.new('lit'); emit = bpy.data.materials.new('emit')
    glass = bpy.data.materials.new('glass')
    housing = bpy.data.materials.new('housing')
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        me = o.data
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        surface_slots = []
        for poly in me.polygons:
            mat = o.material_slots[poly.material_index].material if o.material_slots else None
            col = _base_color(mat)
            finish = mat.get('housing_finish') if mat else None
            if finish:
                surface_slots.append(3)
            else:
                surface_slots.append(2 if mat and mat.get('town_glass') else int(_emissive(mat)))
            for li in poly.loop_indices:
                ca.data[li].color = col
        if 3 in surface_slots:
            bake_balcony_sun(o, depsgraph, ca)
        me.materials.clear()
        me.materials.append(lit); me.materials.append(emit)
        if 2 in surface_slots or 3 in surface_slots:
            me.materials.append(glass)
        if 3 in surface_slots:
            me.materials.append(housing)
        for poly, slot in zip(me.polygons, surface_slots):
            poly.material_index = slot
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.object.mode_set(mode='OBJECT')
    _bake_ao(o)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    path = os.path.join(out_dir, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB',
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_materials='EXPORT', export_normals=True, export_texcoords=False)
    print(f'[ok] {name} {w}x{h} tris={tris} verts={len(o.data.vertices)} {os.path.getsize(path) // 1024}KB')


os.makedirs(out_dir, exist_ok=True)
for name, w, h, facing, fn, actor in lib._SPRITES:
    if actor or (only and name not in only):
        continue
    # 单格山模型只用于旧版美术预览，游戏里的山脊由 Highlands 生成。
    if script == 'terrain_obj' and name in ('terrain-mountain-0', 'terrain-mountain-1', 'terrain-mountain-2'):
        continue
    export(name, w, h, fn)
