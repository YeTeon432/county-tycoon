"""县城住宅小区。每个院落的门牌、楼间空地和屋顶轮廓随房型变化。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import Z0, box, bush, lamp, lot, pyramid, run, sprite, text, tree


def block(x, y, w, d, floors, wall, roof, pitched=False, balconies=False):
    height = floors * 0.24
    box(x, y, Z0, w, d, height, wall, bevel=0.01)
    cols = max(2, round(w / 0.28))
    for floor in range(floors):
        z = Z0 + 0.06 + floor * 0.24
        for col in range(cols):
            wx = x + (col + 0.5) * w / cols - 0.075
            for wy in (y - 0.012, y + d - 0.002):
                box(wx, wy, z, 0.15, 0.014, 0.126, 'glass_dark')
                box(wx + 0.072, wy - 0.002, z, 0.008, 0.018, 0.126, 'white')
            if balconies and floor and col % 2 == 0:
                box(wx - 0.03, y - 0.085, z - 0.05, 0.21, 0.09, 0.025, roof)
                box(wx - 0.03, y - 0.085, z - 0.025, 0.21, 0.014, 0.065, 'tile_white')
        for side in (x - 0.012, x + w - 0.002):
            box(side, y + d * 0.4, z, 0.014, 0.13, 0.13, 'glass')
    box(x + w * 0.5 - 0.06, y - 0.018, Z0, 0.12, 0.02, 0.185, 'brown')
    top = Z0 + height
    box(x - 0.018, y - 0.018, top, w + 0.036, d + 0.036, 0.045, roof)
    if pitched:
        pyramid(x - 0.035, y - 0.035, top + 0.04, w + 0.07, d + 0.07, 0.15, roof)
    else:
        box(x + w * 0.6, y + d * 0.45, top + 0.045, 0.21, 0.19, 0.13, wall)


def gate(name, color):
    for x in (0.58, 1.32):
        box(x, 0.07, Z0, 0.07, 0.09, 0.29, 'tile_beige')
    box(0.54, 0.05, Z0 + 0.29, 0.89, 0.12, 0.13, color)
    text(name, 0.985, 0.046, Z0 + 0.352, 0.10, 'sign_white', 'front')


@sprite('workers-estate', 2, 2)
def workers():
    lot(2, 2, 'concrete')
    block(0.14, 1.40, 1.68, 0.44, 4, 'tile_brick', 'roof_grey', True)
    block(0.18, 0.64, 1.28, 0.46, 3, 'tile_brick', 'roof_grey', True)
    block(1.54, 0.18, 0.32, 0.32, 1, 'paint_cream', 'roof_red')
    for x in (0.16, 0.52):
        box(x, 0.16, Z0, 0.03, 0.03, 0.21, 'steel')
    box(0.11, 0.11, Z0 + 0.21, 0.49, 0.30, 0.035, 'roof_green')
    gate('红星新村', 'sign_red')


@sprite('resettlement', 2, 2)
def resettlement():
    lot(2, 2, 'pave')
    for x, y in ((0.12, 1.32), (1.06, 1.32), (0.13, 0.50)):
        block(x, y, 0.80, 0.50, 5, 'paint_cream', 'roof_red', True)
    box(1.10, 0.55, Z0, 0.68, 0.43, 0.015, 'grass')
    tree(1.47, 0.79, 0.69, z=Z0)
    gate('同心家园', 'brown')


@sprite('highrise', 2, 2)
def highrise():
    lot(2, 2, 'pave')
    for x, y, floors in ((0.13, 1.03, 12), (1.11, 0.64, 10)):
        block(x, y, 0.73, 0.74, floors, 'paint_grey', 'glass_dark', balconies=True)
        box(x + 0.29, y + 0.68, Z0, 0.20, 0.12, floors * 0.24 + 0.26, 'paint_blue')
    tree(0.29, 0.37, 0.78, z=Z0)
    gate('云景华庭', 'glass_dark')


@sprite('garden-estate', 2, 2)
def garden():
    lot(2, 2, 'grass')
    block(0.16, 1.28, 1.02, 0.51, 4, 'tile_beige', 'roof_green', True, True)
    block(1.22, 0.71, 0.61, 0.58, 3, 'tile_white', 'roof_green', True, True)
    box(0.83, 0.04, Z0, 0.28, 1.18, 0.016, 'pave')
    for x, y in ((0.24, 0.30), (0.40, 0.85), (1.76, 0.24), (1.73, 1.70)):
        tree(x, y, 0.68, z=Z0)
    for x in (0.24, 0.48, 1.46):
        bush(x, 0.52, 0.10, z=Z0)
    gate('桂香庭院', 'roof_green')


@sprite('market-estate', 2, 2)
def market():
    lot(2, 2)
    block(0.17, 1.04, 1.50, 0.74, 8, 'tile_beige', 'brown', balconies=True)
    for i, (color, sign) in enumerate((('sign_red', '面馆'), ('roof_green', '鲜果'), ('orange', '杂货'))):
        x = 0.12 + i * 0.59
        box(x, 0.19, Z0, 0.55, 0.44, 0.42, 'tile_white')
        box(x + 0.045, 0.17, Z0, 0.46, 0.022, 0.25, 'glass_dark')
        box(x - 0.015, 0.09, Z0 + 0.27, 0.58, 0.15, 0.13, color)
        text(sign, x + 0.27, 0.086, Z0 + 0.337, 0.10, 'sign_white')
    box(0.50, 0.69, Z0, 0.98, 0.10, 0.25, 'brown')
    text('锦市里', 0.99, 0.685, Z0 + 0.13, 0.14, 'sign_white')
    lamp(1.88, 0.48)


run()
