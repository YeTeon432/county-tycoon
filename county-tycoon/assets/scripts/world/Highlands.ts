import type { Terrain } from '../core/Terrain';

type Point = [number, number, number];
type Rgb = [number, number, number];

function sample(x: number, z: number, salt: number): number {
    let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ salt;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
    t = Math.max(0, Math.min(1, t));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** 按地图的山格连成一张起伏网格。平原、山口和矿场占地的边界高度都是零。 */
export function highlandGeometry(terrain: Terrain) {
    const positions: number[] = [], normals: number[] = [], colors: number[] = [];
    const mountain = (c: number, r: number) => terrain.inBounds(c, r) && terrain.typeAt(c, r) === 'mountain';

    // 量到最近一块平地的距离，5 格以外只由山脊走势决定高度。
    function surface(x: number, z: number): Point {
        const c = Math.floor(x), r = Math.floor(z);
        let clearanceSq = 25;
        for (let j = r - 5; j <= r + 5; j++) {
            for (let i = c - 5; i <= c + 5; i++) {
                if (mountain(i, j)) continue;
                const dx = Math.max(i - x, x - i - 1, 0), dz = Math.max(j - z, z - j - 1, 0);
                clearanceSq = Math.min(clearanceSq, dx * dx + dz * dz);
            }
        }
        const distance = Math.sqrt(clearanceSq);
        const ridge = 1 - Math.abs(Math.sin(0.28 * x - 0.34 * z + 0.85 * Math.sin(0.31 * z)));
        const peaks = 2.7 + 1.35 * Math.sin(0.35 * z + 0.24 * x) + 0.35 * Math.cos(1.13 * x - z);
        const height = (0.9 + ridge * peaks) * (1 - Math.exp(-0.54 * distance)) * Math.min(1, distance / 1.7);
        return [x, height, z];
    }

    const corners = new Map<number, Point>();
    function corner(c: number, r: number): Point {
        const key = r * (terrain.width + 1) + c;
        const found = corners.get(key);
        if (found) return found;
        const interior = mountain(c, r) && mountain(c - 1, r) && mountain(c, r - 1) && mountain(c - 1, r - 1);
        const jitter = interior ? 0.42 : 0;
        const p = surface(c + (sample(c, r, 33) - 0.5) * jitter, r + (sample(c, r, 79) - 0.5) * jitter);
        corners.set(key, p);
        return p;
    }

    function face(a: Point, b: Point, c: Point, foliage?: Rgb): void {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz);
        const slope = 1 - ny / length;
        for (const p of [a, b, c]) {
            positions.push(...p);
            normals.push(nx / length, ny / length, nz / length);
            let color = foliage;
            if (!color) {
                const [x, h, z] = p;
                const grass = mix([0.54, 0.72, 0.40], [0.32, 0.53, 0.37], h * 0.75);
                const stone = mix([0.47, 0.51, 0.52], [0.78, 0.74, 0.65],
                    0.45 + 0.28 * Math.sin(h * 5.4 + x * 0.32 - z * 0.24) + 0.08 * h);
                color = mix(grass, stone, h * 0.48 + slope * 2.3 - 0.48);
            }
            colors.push(...color, foliage ? 1 : Math.min(1, p[1] * 2.2));
        }
    }

    // 在已采样的坡面顶点落松树，两层树冠和山体合为一次绘制。
    function pine([x, y, z]: Point, size: number, angle: number): void {
        for (let tier = 0; tier < 2; tier++) {
            const radius = size * (tier ? 0.22 : 0.33);
            const tip: Point = [x, y + size * (tier ? 1 : 0.76), z];
            const ring: Point[] = [];
            for (let k = 0; k < 6; k++) {
                const a = angle + k * Math.PI / 3;
                ring.push([x + radius * Math.cos(a), y + size * (tier ? 0.40 : 0.025), z + radius * Math.sin(a)]);
            }
            for (let k = 0; k < 6; k++) face(ring[k], tip, ring[(k + 1) % 6], tier ? [0.28, 0.49, 0.35] : [0.20, 0.40, 0.30]);
        }
    }

    for (let r = 0; r < terrain.height; r++) {
        for (let c = 0; c < terrain.width; c++) {
            if (!mountain(c, r)) continue;
            const rim = [corner(c, r), corner(c, r + 1), corner(c + 1, r + 1), corner(c + 1, r)];
            const p = surface(c + 0.34 + 0.32 * sample(c, r, 17), r + 0.34 + 0.32 * sample(c, r, 19));
            for (let k = 0; k < 4; k++) face(rim[k], rim[(k + 1) % 4], p);
            if (p[1] < 1.55 && sample(c, r, 41) < 0.23) pine(p, 0.44 + sample(c, r, 57) * 0.46, c + r);
        }
    }
    return { positions, normals, colors };
}
