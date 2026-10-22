import type { ItemId } from '../domain/economy.ts';

export const gameMenus = {
    goods: { title: '상품 관리', kicker: 'STOCK & TRADE', icon: '▦' },
    craft: { title: '연금술 작업대', kicker: 'A LITTLE ALCHEMY', icon: '⚗' },
    prepare: { title: '오늘의 영업 준비', kicker: 'PREPARE YOUR DAY', icon: '☷' },
    quests: { title: '상점 주인의 퀘스트', kicker: 'YOUR FIRST STEPS', icon: '✧' },
    upgrade: { title: '상점 확장', kicker: 'GROW YOUR SHOP', icon: '⇧' },
    ledger: { title: '상점 장부', kicker: 'THE MERCHANT’S LEDGER', icon: '▤' },
    forest: { title: '달빛 숲 탐색', kicker: 'A WALK IN THE MOONLIT WOODS', icon: '♧' },
    settings: { title: '게임 메뉴', kicker: 'MOONLIGHT MERCHANT', icon: '☰' },
} as const;
export type GameMenu = keyof typeof gameMenus;
export const dockMenus = ['goods', 'craft', 'prepare', 'quests', 'upgrade', 'ledger'] as const;

// 저장하지 않는 화면 상태. 경제·영업 상태와 분리해 메뉴 전환으로 게임을 다시 만들지 않는다.
export function createGameUiStore() {
    let snapshot: Readonly<{ menu: GameMenu | null; shelfItem: ItemId | null }> = { menu: null, shelfItem: null };
    const listeners = new Set<() => void>();
    function change(menu: GameMenu | null, shelfItem: ItemId | null = null) {
        if (snapshot.menu === menu && snapshot.shelfItem === shelfItem) return;
        snapshot = { menu, shelfItem };
        listeners.forEach(listener => listener());
    }
    return {
        getSnapshot: () => snapshot,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        open(menu: GameMenu) { change(menu); },
        openShelf(item: ItemId) { change('goods', item); },
        close() { change(null); },
    };
}
export const gameUiStore = createGameUiStore();
