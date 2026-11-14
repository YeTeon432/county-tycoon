/**
 * 模拟层测试入口：把 core/sim 编到 tests/.build，再 require 跑断言。
 * 用法：node tests/sim/run.js [--no-build]
 * 不需要 Cocos 编辑器，也不需要 Cocos 运行时。
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const here = __dirname;
const project = path.resolve(here, '../..');
const outDir = path.resolve(project, 'tests/.build');

function findTsc() {
    const cand = process.env.TSC;
    if (cand && fs.existsSync(cand)) return cand;
    const cocos = '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc';
    if (fs.existsSync(cocos)) return cocos;
    try {
        return require.resolve('typescript/bin/tsc');
    } catch (e) {
        return null;
    }
}

function build() {
    const tsc = findTsc();
    if (!tsc) {
        console.error('找不到 tsc。设置环境变量 TSC 指向 typescript/bin/tsc');
        process.exit(1);
    }
    execFileSync(process.execPath, [tsc, '-p', path.join(here, 'tsconfig.json')], {
        cwd: project, stdio: 'inherit',
    });
}

if (!process.argv.includes('--no-build')) build();
if (process.argv.includes('--sweep')) {
    require(path.join(outDir, 'tests/sim/sweep.js')).main();
} else if (process.argv.includes('--vehicles')) {
    require(path.join(outDir, 'tests/sim/longrun.js')).vehiclesMain();
} else if (process.argv.includes('--long')) {
    require(path.join(outDir, 'tests/sim/longrun.js')).main();
} else {
    require(path.join(outDir, 'tests/sim/sim.test.js'));
}
