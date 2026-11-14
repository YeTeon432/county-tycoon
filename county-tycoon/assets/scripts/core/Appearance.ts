/**
 * 居民样貌（D023，DESIGN 14）：从档案算出「皮肤名」，街上的小人和档案头像都用它。
 *
 * 纯函数、不依赖引擎、不存档：同一个人只要年龄段不变，样子就不变；
 * 长大 / 变老换体型时，样子自然跟着换。
 */
export type BodyType = 'boy' | 'girl' | 'man' | 'woman' | 'oldman' | 'oldwoman';

/** 每种体型有几套外观（和 docs/art/3d/actors.py 出的图对应） */
export const LOOKS: Record<BodyType, number> = {
    boy: 2, girl: 2, man: 3, woman: 3, oldman: 2, oldwoman: 2,
};

/** 体型的中文名（档案里用） */
export const BODY_NAME: Record<BodyType, string> = {
    boy: '男孩', girl: '女孩', man: '成年男', woman: '成年女', oldman: '老爷爷', oldwoman: '老奶奶',
};

export interface LookInput {
    id: number;
    gender: 'M' | 'F';
    age: number;
}

export function bodyOf(r: LookInput): BodyType {
    const m = r.gender === 'M';
    if (r.age < 18) return m ? 'boy' : 'girl';
    if (r.age >= 60) return m ? 'oldman' : 'oldwoman';
    return m ? 'man' : 'woman';
}

/** id 哈希（Knuth 乘法），让相邻 id 的人不按顺序轮换外观 */
function hash(id: number): number {
    return ((id * 2654435761) >>> 0);
}

/** 皮肤名，例如 'woman1'。街上帧名 = `${skin}-front0`，头像帧名 = `face-${skin}` */
export function skinOf(r: LookInput): string {
    const body = bodyOf(r);
    return `${body}${hash(r.id) % LOOKS[body]}`;
}

/** 全部皮肤名（测试 / 预加载用） */
export function allSkins(): string[] {
    const out: string[] = [];
    (Object.keys(LOOKS) as BodyType[]).forEach((b) => {
        for (let i = 0; i < LOOKS[b]; i++) out.push(`${b}${i}`);
    });
    return out;
}
