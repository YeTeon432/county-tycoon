import json, sys
from PIL import Image
pal = {c['index']: c['hex'] for c in json.load(open(sys.argv[1]))['colors']}
OUT = sys.argv[2]
KEY = {'K':0,'n':1,'a':2,'v':3,'G':4,'g':5,'e':6,'W':7,'q':8,'l':12,'D':14,'B':15,'t':17,'Y':19,
       'c':20,'y':21,'o':22,'r':23,'R':24,'s':25,'b':26,'T':27,'C':28,'p':29,'P':30,'w':31}
def rgb(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))+(255,)
TOP='.KKKKKKKKKKKKKK.'; ROW='K'*16
def save(name, rows):
    assert len(rows)==16, (name,len(rows))
    for i,r in enumerate(rows): assert len(r)==16, (name,i,len(r),r)
    im=Image.new('RGBA',(16,16),(0,0,0,0))
    for y,r in enumerate(rows):
        for x,ch in enumerate(r):
            if ch!='.': im.putpixel((x,y), rgb(pal[KEY[ch]]))
    im.save(f'{OUT}/{name}.png')
    im.resize((256,256),Image.NEAREST).save(f'/tmp/art/{name}_big.png')

# 早餐铺：屋顶摞着蒸笼冒白气，黄橙雨棚，窗台摆一排蒸笼
save('breakfast', [TOP,
 'KeeeeeeWeWeeeeeK','KeeeeeWeWeeeeeeK','KeeeeKKKKKKeeeeK','KeeeKttttttKeeeK',
 'KeeeKBBBBBBKeeeK','KeeeKttttttKeeeK','KeeeKBBBBBBKeeeK', ROW,
 'KyoyoyoyoyoyoyoK','KooooooooooooooK','KyyyyyyyyyyyyyyK',
 'KyKcccccccKyBByK','KyKtBtBtBtKyBByK','KyyyyyyyyyyyBByK', ROW])
# 烧烤摊：深色棚顶挂一串灯、红灯箱，下面长条烤炉炭火通红
save('bbq', [TOP,
 'KnnnnnnnnnnnnnnK','KnynnnynnnynnnyK','KnnnnnnnnnnnnnnK','KnRRRRRRRRRRRRnK',
 'KnRyRyRyRyRyRRnK','KnRRRRRRRRRRRRnK','KnnnnnnnnnnnnnnK', ROW,
 'KGGGGGGGGGGGGGGK','KGoroRoroRoroRGK','KGrorRrorRrorRGK','KGGGGGGGGGGGGGGK',
 'KnnBnnnnnnnnBnnK','KnnBnnnnnnnnBnnK', ROW])
# 快递驿站：白顶蓝招牌，蓝白雨棚，门口堆纸箱
save('parcel', [TOP,
 'KccccccccccccccK','KccccccccccccccK','KbbbbbbbbbbbbbbK','KbWWbWWbWWbWWbbK',
 'KbbbbbbbbbbbbbbK','KccccccccccccccK','KccccccccccccccK', ROW,
 'KWbWbWbWbWbWbWbK','KccccccccccccccK','KcccccccccKbbKcK',
 'KtBttBtcccKbbKcK','KtBttBttBtKbbKcK','KtBttBttBtKbcKcK', ROW])
# 网吧：深蓝紫外墙，黑底青蓝灯牌，暗窗里一排发蓝光的屏幕
save('net-cafe', [TOP,
 'KvvvvvvvvvvvvvvK','KvKKKKKKKKKKKKvK','KvKCCbKbbKbCCKvK','KvKCbbKCCKbbCKvK',
 'KvKKKKKKKKKKKKvK','KvvvvvvvvvvvvvvK','KvvvvvvvvvvvvvvK', ROW,
 'KGGGGGGGGGGGGGGK','KGnnnnnKKnnnnnGK','KGnbnbnKvnbnbnGK','KGnCnCnKvnCnCnGK',
 'KGnnnnnKvnnnnnGK','KGGGGGGKvGGGGGGK', ROW])
# 手机店：浅灰顶上青色灯箱（中间一部手机），深青门头，大玻璃橱窗
save('phone-shop', [TOP,
 'KggggggggggggggK','KgKKKKKKKKKKKKgK','KgKCCCKKKKCCCKgK','KgKCCCKWWKCCCKgK',
 'KgKCCCKWWKCCCKgK','KgKCCCKKKKCCCKgK','KgKKKKKKKKKKKKgK', ROW,
 'KTTTTTTTTTTTTTTK','KTWccccKKWccccTK','KTcWcccKccWcccTK','KTcccbcKcccbccTK',
 'KTcccccKcccccTK'[:0] or 'KTcccccKccccccTK','KTTTTTTKcTTTTTTK', ROW])
# 理发店：紫顶白招牌画把剪刀，门边一根红白蓝转灯
save('barber', [TOP,
 'KppppppppppppppK','KppppppppppppppK','KpWWWWWWWWWWWWpK','KpWWWKWWKWWWWWpK',
 'KpWWWWKKWWWWWWpK','KpWWWKWWKWWWWWpK','KppppppppppppppK', ROW,
 'KwwwwwwwwwwwwwwK','KwKKKKKwKKwKbKwK','KwbcbbbwKBwKrKwK','KwbbbbbwKBwKWKwK',
 'KwbbbbbwKBwKrKwK','KwwwwwwwKBwKbKwK', ROW])
# 补习班：黄色招牌，门口木框黑板写着粉笔字
save('tutoring', [TOP,
 'KggggggggggggggK','KgKKKKKKKKKKKKgK','KgKyyyyyyyyyyKgK','KgKyKyyKKyyKyKgK',
 'KgKyyyyyyyyyyKgK','KgKKKKKKKKKKKKgK','KggggggggggggggK', ROW,
 'KeeeeeeeeeeeeeeK','KeBBBBBBBBeKKeeK','KeBqqWqqqBeKDeeK','KeBqWWqWqBeKDeeK',
 'KeBqqqqqqBeKDeeK','KeBBBBBBBBeKDeeK', ROW])
print('ok')
