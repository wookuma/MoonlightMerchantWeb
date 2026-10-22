import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { gameMenus, gameUiStore } from '../stores/gameUiStore';
import { gameStore } from '../stores/gameStore';
import { ShopFlowAction, ShopFlowNavigation } from './ShopFlowBar';

export function GameModal({ children }: { children: ReactNode }) {
    const { menu } = useSyncExternalStore(gameUiStore.subscribe, gameUiStore.getSnapshot);
    const { message, success, revision } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const dialog = useRef<HTMLDialogElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    const open = menu !== null;
    useLayoutEffect(() => {
        const element = dialog.current;
        if (!element || !open) return;
        const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (!element.open) element.showModal();
        heading.current?.focus();
        return () => {
            if (element.open) element.close();
            if (origin?.isConnected) origin.focus();
        };
    }, [open]);
    useLayoutEffect(() => { if (menu) heading.current?.focus(); }, [menu]);
    return <dialog ref={dialog} className="game-modal" aria-labelledby="game-modal-title" aria-describedby="game-modal-help"
        onCancel={event => { if (event.target === event.currentTarget) { event.preventDefault(); gameUiStore.close(); } }}
        onClose={event => { if (event.target === event.currentTarget && !event.currentTarget.open) gameUiStore.close(); }}
        onClick={event => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) gameUiStore.close();
        }}>
        <header className="game-modal-head"><div className="modal-title-group"><span className={`modal-menu-art dock-art ${menu ?? 'settings'}`} aria-hidden="true" /><div><span className="eyebrow">{menu ? gameMenus[menu].kicker : ''}</span><h2 id="game-modal-title" ref={heading} tabIndex={-1}>{menu ? gameMenus[menu].title : ''}</h2></div></div><button className="shell-icon-button" aria-label="메뉴 닫기" onClick={() => gameUiStore.close()}>×</button></header>
        {menu !== 'settings' && <ShopFlowNavigation />}
        <div className="game-modal-content">{children}</div>
        <div className={`modal-feedback ${success ? '' : 'error'}`} role="status" aria-live="polite" aria-atomic="true"><span key={revision}>{message}</span></div>
        <footer className="game-modal-foot" id="game-modal-help"><ShopFlowAction /></footer>
    </dialog>;
}
