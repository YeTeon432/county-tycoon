import {
    _decorator, Component, Node, Label, UITransform, Layers, Color, Graphics, view,
} from 'cc';
import { WorldConfig, loadWorldConfig } from '../core/WorldConfig';
import { WorldView } from '../world/WorldView';

const { ccclass } = _decorator;

/**
 * 游戏根节点：场景里唯一需要手动挂的脚本。
 *
 * 职责只有两件事：
 *   1. 加载配置（数值在 json 里，不写在代码里）；
 *   2. 按配置搭出地图、HUD，把各模块接起来。
 *
 * 场景文件里只放 Canvas + 一台相机 + 一个空节点挂这个脚本，
 * 其余节点全部代码生成。好处是改布局不用改 .scene（二进制式的 JSON 很容易冲突），
 * 也方便以后直接换设计分辨率。
 */
@ccclass('GameRoot')
export class GameRoot extends Component {
    private _config: WorldConfig | null = null;
    private _view: WorldView | null = null;
    private _zoomLabel: Label | null = null;

    protected start(): void {
        loadWorldConfig().then((config) => {
            this._config = config;
            this.buildWorld(config);
            this.buildHud();
        }).catch((err) => {
            console.error('[GameRoot] 启动失败', err);
        });
    }

    /** 搭地图，挂到 Canvas 下 */
    private buildWorld(config: WorldConfig): void {
        // 地图容器：只作为变换的父节点，尺寸不参与任何计算
        const worldRoot = new Node('WorldRoot');
        worldRoot.layer = Layers.Enum.UI_2D;
        worldRoot.addComponent(UITransform);
        this.node.addChild(worldRoot);

        const worldView = worldRoot.addComponent(WorldView);
        this._view = worldView;
        worldView.create(config);
    }

    /** 顶部一条简单的 HUD，用来确认坐标系、缩放是对的 */
    private buildHud(): void {
        const visible = view.getVisibleSize();
        const barHeight = 120;

        const bar = new Node('Hud');
        bar.layer = Layers.Enum.UI_2D;
        const barTrans = bar.addComponent(UITransform);
        barTrans.setContentSize(visible.width, barHeight);
        bar.setPosition(0, visible.height / 2 - barHeight / 2, 0);
        this.node.addChild(bar);

        // 半透明底，便于在浅色地面上看清文字
        const bg = bar.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 0, 150);
        bg.rect(-visible.width / 2, -barHeight / 2, visible.width, barHeight);
        bg.fill();

        // 两行：第一行是标题+倍率，第二行是操作提示。
        // 竖屏只有 720 宽，单行塞不下，字号也得给手机留余地。
        const labelNode = new Node('ZoomLabel');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.addComponent(UITransform);
        const label = labelNode.addComponent(Label);
        label.fontSize = 30;
        label.lineHeight = 38;
        label.color = new Color().fromHEX('#f4f4f4');
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.NONE;
        labelNode.setPosition(0, 0, 0);
        bar.addChild(labelNode);

        this._zoomLabel = label;
        this.updateZoomLabel(this._view ? this._view.zoom : 1);

        if (this._view) {
            this._view.onZoomChanged = (zoom) => this.updateZoomLabel(zoom);
        }
    }

    private updateZoomLabel(zoom: number): void {
        if (!this._zoomLabel) return;
        this._zoomLabel.string = `《我在县城当首富》  ×${zoom.toFixed(1)}\n拖动平移 / 双指缩放`;
    }
}
