import { items } from './economy.ts';
import type { EconomyState } from './economy.ts';
import type { ShopDay } from './shopDay.ts';

export const DAILY_EXPLORATIONS = 2;
export const forageMaterials = ['herb', 'mushroom'] as const;
type ForageResult = Readonly<{ ok: boolean; economy: EconomyState; day: ShopDay; message: string }>;

// 확률·시계·저장소에 의존하지 않는 하루 두 번의 수집이다.
export function forage(economy: EconomyState, day: ShopDay, material: string): ForageResult {
    const fail = (message: string): ForageResult => ({ ok: false, economy, day, message });
    if (day.phase !== 'preparing') return fail('숲 탐색은 영업 준비 시간에만 가능합니다. 다음 날 준비를 시작해 주세요.');
    if (!Number.isSafeInteger(day.explorationUsed) || day.explorationUsed < 0 || day.explorationUsed > DAILY_EXPLORATIONS) return fail('탐색 횟수를 확인해 주세요.');
    if (day.explorationUsed >= DAILY_EXPLORATIONS) return fail('오늘의 숲 탐색을 모두 사용했습니다. 다음 날 다시 탐색할 수 있어요.');
    const item = items.find(entry => entry.id === material && forageMaterials.some(id => id === entry.id));
    if (!item) return fail('숲에서는 달빛 약초와 달빛 버섯만 수집할 수 있어요.');
    const count = economy.inventory[item.id];
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(count + 1)) return fail('보관 가능한 재고 수량을 초과했습니다.');
    return {
        ok: true,
        economy: { ...economy, inventory: { ...economy.inventory, [item.id]: count + 1 } },
        day: { ...day, explorationUsed: day.explorationUsed + 1 },
        message: `${item.name} 1개를 수집해 보관함에 넣었습니다. 오늘 남은 탐색 ${DAILY_EXPLORATIONS - day.explorationUsed - 1}회`,
    };
}
