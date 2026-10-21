import { items } from '../../src/domain/economy.ts';
import { DISPLAY_LIMIT, setDisplayQuantity } from '../../src/domain/display.ts';

// 기존 경제/방문 회귀 테스트의 준비 단계에 명시적으로 진열한다. 제품 코드의 자동 진열이 아니다.
export function prepareShelves(store) {
    if (store.getSnapshot().day.phase !== 'preparing') return;
    for (const item of items) {
        const state = store.getSnapshot().economy;
        const target = Math.min(DISPLAY_LIMIT, state.inventory[item.id]);
        if (state.displayed[item.id] !== target) store.setDisplay(item.id, target);
    }
}
export function stockShelves(state) {
    for (const item of items) state = setDisplayQuantity(state, item.id, Math.min(DISPLAY_LIMIT, state.inventory[item.id])).state;
    return state;
}
