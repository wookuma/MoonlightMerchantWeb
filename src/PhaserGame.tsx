import { useEffect, useRef } from 'react';
import StartGame from './game/main';

export function PhaserGame() {
    const container = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!container.current) return;
        const game = StartGame(container.current);
        return () => { game.destroy(true); };
    }, []);
    return <div ref={container} id="game-container" />;
}
