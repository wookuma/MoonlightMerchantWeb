import { gameStore } from './gameStore.ts';
import { gameUiStore } from './gameUiStore.ts';

// 영업 규칙은 gameStore에 맡기고, 전환 성공 뒤에만 화면을 이동한다.
export function createShopFlow(store = gameStore, ui = gameUiStore) {
    return {
        startTrading() {
            if (store.getSnapshot().day.phase !== 'preparing') return;
            store.startDay();
            if (store.getSnapshot().day.phase === 'open') ui.close();
        },
        prepareNextDay() {
            if (store.getSnapshot().day.phase !== 'closed') return;
            store.nextDay();
            if (store.getSnapshot().day.phase === 'preparing') ui.open('goods');
        },
    };
}
export const shopFlow = createShopFlow();
