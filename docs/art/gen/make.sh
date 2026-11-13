#!/bin/sh
# 重新出全部图并打图集。用法：sh docs/art/gen/make.sh   （之后重启 Cocos Creator）
set -e
cd "$(dirname "$0")/../../.."
B=docs/art/build; R=county-tycoon/assets/resources
mkdir -p $B/buildings $B/ground
python3 -I docs/art/gen/sample.py $B
python3 -I docs/art/gen/shops.py $B/buildings
python3 -I docs/art/gen/big.py $B/buildings
python3 -I docs/art/gen/pack.py $B $R
