import { AudioClip, AudioSource, Input, Node, input, resources } from 'cc';
import { getPlatform } from '../platform/Platform';

type ActionSound = 'tap' | 'road' | 'build' | 'blocked' | 'remove';
type EventSound = 'complete' | 'wish' | 'promote';
type ClipName = ActionSound | EventSound | 'town-theme';
const clips: ClipName[] = ['tap', 'road', 'build', 'blocked', 'remove', 'complete', 'wish', 'promote', 'town-theme'];
const MUSIC_KEY = 'county-music';
const EFFECTS_KEY = 'county-sound-effects';

class TownAudio {
    musicOn = true;
    effectsOn = true;
    private root: Node | null = null;
    private sources = new Map<ClipName, AudioSource>();
    private activeAction?: AudioSource;
    private activeEvent?: AudioSource;
    private lastRoad = -Infinity;
    private lastBlocked = -Infinity;
    private lastEvent = -Infinity;
    private unlocked = false;
    private foreground = true;
    private musicRequested = false;
    private generation = 0;

    attach(parent: Node): void {
        const platform = getPlatform();
        this.root = new Node('TownAudio');
        parent.addChild(this.root);
        this.effectsOn = platform.getItem(EFFECTS_KEY) !== '0';
        this.musicOn = platform.getItem(MUSIC_KEY) !== '0';
        this.foreground = platform.name !== 'web' || typeof document === 'undefined' || !document.hidden;
        platform.onHide(this.hide);
        platform.onShow(this.show);
        if (platform.name === 'web' && typeof document !== 'undefined') {
            document.addEventListener('mouseup', this.canvasGesture, true);
            document.addEventListener('touchend', this.canvasGesture, true);
        } else {
            input.on(Input.EventType.TOUCH_END, this.unlock, this);
        }
        const root = this.root;
        for (const name of clips) {
            resources.load('audio/' + name, AudioClip, (err, clip) => {
                if (err || !clip || this.root !== root || !root.isValid) return;
                const node = new Node(name);
                const source = node.addComponent(AudioSource);
                source.playOnAwake = false;
                source.loop = name === 'town-theme';
                source.volume = source.loop ? 0.32 : 0.85;
                root.addChild(node);
                // Cocos 3.8.8 prepares a player asynchronously after assigning its clip.
                node.once('audiosource-loaded', () => {
                    if (this.root !== root || !root.isValid) return;
                    this.sources.set(name, source);
                    if (source.loop) this.syncMusic();
                });
                source.clip = clip;
            });
        }
    }

    detach(): void {
        if (!this.root) return;
        const platform = getPlatform();
        platform.offHide(this.hide);
        platform.offShow(this.show);
        if (platform.name === 'web' && typeof document !== 'undefined') {
            document.removeEventListener('mouseup', this.canvasGesture, true);
            document.removeEventListener('touchend', this.canvasGesture, true);
        }
        input.off(Input.EventType.TOUCH_END, this.unlock, this);
        this.hide();
        this.sources.clear();
        this.root = null;
        this.unlocked = false;
        this.lastRoad = this.lastBlocked = this.lastEvent = -Infinity;
    }

    private canvasGesture = (e: Event): void => {
        if ((e.target as Element)?.tagName === 'CANVAS') this.unlock();
    };

    private unlock = (): void => {
        if (this.unlocked || !this.foreground) return;
        this.unlocked = true;
        this.syncMusic();
    };

    private hide = (): void => {
        this.foreground = false;
        this.stopEffects();
        this.syncMusic();
    };

    private show = (): void => {
        this.foreground = true;
        this.syncMusic();
    };

    setMusic(on: boolean): boolean {
        this.musicOn = on;
        this.syncMusic();
        return getPlatform().setItem(MUSIC_KEY, on ? '1' : '0');
    }

    setEffects(on: boolean): boolean {
        this.effectsOn = on;
        if (on) this.action('tap');
        else this.stopEffects();
        return getPlatform().setItem(EFFECTS_KEY, on ? '1' : '0');
    }

    private syncMusic(): void {
        const source = this.sources.get('town-theme');
        if (!source) return;
        const play = this.unlocked && this.foreground && this.musicOn;
        if (play === this.musicRequested) return;
        this.musicRequested = play;
        if (play) source.play();
        else source.pause();
    }

    private stopEffects(): void {
        this.generation++;
        this.activeAction?.stop();
        this.activeEvent?.stop();
        this.activeAction = this.activeEvent = undefined;
    }

    private get audible(): boolean {
        return this.unlocked && this.foreground && this.effectsOn;
    }

    action(name: ActionSound): void {
        const source = this.sources.get(name);
        if (!source || !this.audible) return;
        const now = Date.now();
        if (name === 'road' && now - this.lastRoad < 120) return;
        if (name === 'blocked' && now - this.lastBlocked < 500) return;
        if (name === 'road') this.lastRoad = now;
        if (name === 'blocked') this.lastBlocked = now;
        if (this.activeAction !== source) this.activeAction?.stop();
        this.activeAction = source;
        source.play();
    }

    event(name: EventSound): void {
        const source = this.sources.get(name);
        if (!source || !this.audible) return;
        const now = Date.now();
        if (name !== 'promote' && now - this.lastEvent < 2000) return;
        this.lastEvent = now;
        if (this.activeEvent !== source) this.activeEvent?.stop();
        this.activeEvent = source;
        source.play();
    }

    /** Bind a monthly cue to its first appearance. Muting or leaving discards queued audio. */
    whenShown(name: EventSound): (() => void) | undefined {
        if (!this.audible || !this.sources.has(name)) return;
        const generation = this.generation;
        return () => { if (generation === this.generation) this.event(name); };
    }
}

export const townAudio = new TownAudio();
