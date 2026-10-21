import type { Scene } from 'phaser';
import { gameUiStore } from '../stores/gameUiStore.ts';

// 타이머를 재생성하지 않고 정지 전 남은 시간을 보존한다.
export function bindMenuPause(scene: Pick<Scene, 'time' | 'tweens'>, ui = gameUiStore, now = Date.now) {
    const clockPaused = scene.time.paused, tweensPaused = scene.tweens.paused;
    let disposed = false;
    let pauseStarted: number | null = null;
    const restoreTweenTimeline = () => {
        if (pauseStarted === null) return;
        // Phaser 4 TweenManager는 재개 시 Date.now()로 delta를 계산한다.
        // 원점과 직전 프레임을 함께 옮겨 메뉴를 본 시간만 제외한다.
        const duration = Math.max(0, now() - pauseStarted);
        scene.tweens.startTime += duration;
        scene.tweens.prevTime += duration;
        pauseStarted = null;
    };
    const sync = () => {
        const paused = ui.getSnapshot().menu !== null;
        if (paused && !tweensPaused && pauseStarted === null) pauseStarted = now();
        if (!paused) restoreTweenTimeline();
        scene.time.paused = clockPaused || paused;
        scene.tweens.paused = tweensPaused || paused;
    };
    const unsubscribe = ui.subscribe(sync);
    sync();
    return () => {
        if (disposed) return;
        disposed = true;
        unsubscribe();
        restoreTweenTimeline();
        scene.time.paused = clockPaused;
        scene.tweens.paused = tweensPaused;
    };
}
