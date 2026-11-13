import json, sys
from PIL import Image
pal = {c['index']: c['hex'] for c in json.load(open(sys.argv[1]))['colors']}
OUT = sys.argv[2]
# 字符 -> 调色板索引
KEY = {'K':0,'R':24,'r':23,'G':4,'g':5,'s':25,'B':15,'D':14,'y':21,'b':26,'c':20,'W':7,'w':31,
       'P':30,'p':29,'a':2,'A':4,'n':1,'o':22,'d':18}
def rgb(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))+(255,)
def save(name, rows):
    n=len(rows)
    for i,r in enumerate(rows): assert len(r)==n, (name,i,len(r),r)
    im=Image.new('RGBA',(n,n),(0,0,0,0))
    for y,r in enumerate(rows):
        for x,ch in enumerate(r):
            if ch!='.': im.putpixel((x,y), rgb(pal[KEY[ch]]))
    im.save(f'{OUT}/{name}.png')
    im.resize((n*16,n*16),Image.NEAREST).save(f'/tmp/art/{name}_big.png')

# 自建房：上面红瓦坡顶（屋脊灰），下面灰砖墙，两扇窗一扇木门
save('house', [
 '.KKKKKKKKKKKKKK.',
 'KRRRRRRRRRRRRRRK',
 'KRRRRRRRRRRRRRRK',
 'KGGGGGGGGGGGGGGK',
 'KrrRrrRrrRrrRrrK',
 'KrrRrrRrrRrrRrrK',
 'KrrRrrRrrRrrRrrK',
 'KrrRrrRrrRrrRrrK',
 'KRRRRRRRRRRRRRRK',
 'KKKKKKKKKKKKKKKK',
 'KGGGGGKKKKGGGGGK',
 'KgcbgGKBBKGgcbgK',
 'KgbbggKBBKggbbgK',
 'KGgggGKByKGgggGK',
 'KggGggKBBKggGggK',
 'KKKKKKKKKKKKKKKK',
])
# 奶茶店：浅色平顶上立一个大奶茶杯招牌，粉白条纹雨棚，粉色门面+玻璃
save('milk-tea', [
 '.KKKKKKKKKKKKKK.',
 'KwwwwwwwwwwKwwwK',
 'KwwwwwwwwwKwwwwK',
 'KwwwwKWWWWWKwwwK',
 'KwwwwKdddddKwwwK',
 'KwwwwKdddddKwwwK',
 'KwwwwwKDdDKwwwwK',
 'KwwwwwwKKKwwwwwK',
 'KKKKKKKKKKKKKKKK',
 'KPWPWPWPWPWPWPWK',
 'KpPpPpPpPpPpPpPK',
 'KPPPPPPPPPPPPPPK',
 'KPbbcbPKcKPbcbbK'.replace('KPbbcbPKcKPbcbbK','KPbcbbPKcKPbbcPK'),
 'KPbbbbPKbKPbbbPK',
 'KPPPPPPKbKPPPPPK',
 'KKKKKKKKKKKKKKKK',
])
# 马路：暂时做成方向中立的沥青（无边框、无标线），任意方向拼接都无缝
save('road', [
 'aaaaaaaaaaaaaaaa',
 'aaaaaaAaaaaaaaaa',
 'aaaaaaaaaaaaaaaa',
 'aaaaaaaaaaaaaaaa',
 'aaaaaaaaaAaaaaaa',
 'aaaaaaaaaaaaaaaa',
 'aaaaaaaaaaaaaaAa',
 'aaaaaaaaaaaaaaaa',
 'aAaaaaaaaaaaaaaa',
 'aaaaaaaaaaaaaaaa',
 'aaaaaaaAaaaaaaaa',
 'aaaaaaaaaaaaaaaa',
 'aaaaaaaaaaaaaAaa',
 'aaaaaaaaaaaaaaaa',
 'aaaaaaaaaaaaaaaa',
 'aaaaaAaaaaaaaaaa',
])
print('ok')
