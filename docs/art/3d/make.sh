#!/bin/sh
# D021：重新渲染全部 3D 图并打图集。用法：sh docs/art/3d/make.sh   （之后重启 Cocos Creator）
# 只重出某几张：sh docs/art/3d/make.sh house milk-tea   （地面不重出，图集照样重打）
set -e
cd "$(dirname "$0")/../../.."
BL=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
B=docs/art/build3d; R=county-tycoon/assets/resources
mkdir -p $B/buildings $B/actors $B/ground
for s in homes_shops civic_industry terrain_obj construction housing; do
  "$BL" -b -P docs/art/3d/$s.py -- $B/buildings "$@" 2>&1 | grep -E '^\[(ok|warn)\]|Error|Traceback' || true
done
"$BL" -b -P docs/art/3d/actors.py -- $B/actors "$@" 2>&1 | grep -E '^\[(ok|warn)\]|Error|Traceback' || true
python3 -I docs/art/3d/shadows.py $B/actors | grep -E '^\[ok\]' || true     # T405：人车影子（PIL）
if [ $# -eq 0 ] || [ ! -f $B/ground/ground.png ]; then python3 -I docs/art/3d/ground.py $B; fi
python3 -I docs/art/3d/pack.py $B $R
python3 -I docs/art/3d/hitmask.py $R     # T424：点楼按真实画面判定
# D033：楼 / 山树的 3D 模型（游戏实时渲染用），和上面的预渲染图同一套建模
for s in homes_shops civic_industry housing terrain_obj; do
  "$BL" -b -P docs/art/3d/export_glb.py -- $R/models3d $s "$@" 2>&1 | grep -E '^\[(ok|warn)\]|Error|Traceback' || true
done
