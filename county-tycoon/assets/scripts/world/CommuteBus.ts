import { primitives } from 'cc';

/** 每个游戏整点发车，偶数小时从起点发，奇数小时从终点发。 */
export function busPosition(path: readonly number[], width: number, hour: number) {
    const phase = hour % 2;
    const along = (phase < 1 ? phase : 2 - phase) * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(along)), t = along - i;
    const a = path[i], b = path[i + 1];
    const dx = b % width - a % width, dz = Math.floor(b / width) - Math.floor(a / width);
    return { x: a % width + 0.5 + dx * t, z: Math.floor(a / width) + 0.5 + dz * t,
        yaw: Math.atan2(dx, dz) * 180 / Math.PI + (phase < 1 ? 0 : 180) };
}

/** 一张顶点色网格，所有线路共用同一辆县城绿白小巴的模型。 */
export function busGeometry() {
    const positions: number[] = [], normals: number[] = [], indices: number[] = [], colors: number[] = [];
    const cube = primitives.box();
    const tire = primitives.cylinder(0.5, 0.5, 1, { radialSegments: 10 });
    function part(x: number, y: number, z: number, w: number, h: number, l: number, rgb: number[], wheel = false) {
        const shape = wheel ? tire : cube, start = positions.length / 3;
        for (let i = 0; i < shape.positions.length; i += 3) {
            const [a, b, c] = shape.positions.slice(i, i + 3);
            const [nx, ny, nz] = shape.normals!.slice(i, i + 3);
            positions.push(x + (wheel ? b : a) * w, y + (wheel ? -a : b) * h, z + c * l);
            normals.push(wheel ? ny : nx, wheel ? -nx : ny, nz);
            colors.push(...rgb, 1);
        }
        for (const index of shape.indices!) indices.push(start + index);
    }
    const green = [0.13, 0.57, 0.40], cream = [1, 0.91, 0.70], glass = [0.14, 0.29, 0.35];
    part(0, 0.22, 0, 0.48, 0.23, 1.06, green);
    part(0, 0.41, 0, 0.46, 0.21, 1.02, cream);
    part(0, 0.54, 0, 0.49, 0.06, 1.05, cream);
    for (const side of [-1, 1]) {
        for (const z of [-0.34, -0.12, 0.10, 0.32]) part(side * 0.231, 0.42, z, 0.012, 0.15, 0.185, glass);
        for (const z of [-0.34, 0.34]) part(side * 0.23, 0.115, z, 0.08, 0.225, 0.225, [0.11, 0.13, 0.13], true);
        part(side * 0.15, 0.22, 0.534, 0.095, 0.055, 0.015, [1, 0.84, 0.38]);
    }
    part(0, 0.42, 0.515, 0.39, 0.15, 0.018, glass);
    part(0, 0.42, -0.515, 0.32, 0.12, 0.018, glass);
    return { positions, normals, colors, indices };
}
