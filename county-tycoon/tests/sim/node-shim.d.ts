/**
 * 测试用的最小 node 声明（项目没有 node_modules，Cocos 里也没有 @types/node）。
 * 只声明 tests/ 里真正用到的几个函数。
 */
declare module 'fs' {
    export function readFileSync(path: string, encoding: 'utf8'): string;
    export function existsSync(path: string): boolean;
}
declare module 'path' {
    export function join(...parts: string[]): string;
    export function resolve(...parts: string[]): string;
}
declare module 'child_process' {
    export function execFileSync(file: string, args: string[], opts?: { cwd?: string; stdio?: 'inherit' | 'pipe' }): Uint8Array;
}
declare const __dirname: string;
declare const require: { (path: string): any; main?: unknown; resolve?: (path: string) => string };
declare const module: unknown;
declare const process: {
    cwd(): string;
    argv: string[];
    env: Record<string, string | undefined>;
    exitCode?: number;
    execPath: string;
    exit(code?: number): never;
    stdout: { write(s: string): void };
    stderr: { write(s: string): void };
};
