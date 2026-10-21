import type { EconomyState, Result } from './economy.ts';

export const expansionStages = [
    { level: 0, capacity: 3, customers: 5, totalCost: 0 },
    { level: 1, capacity: 5, customers: 7, totalCost: 300 },
    { level: 2, capacity: 7, customers: 9, totalCost: 900 },
] as const;

export function expansionStage(level: number) {
    return expansionStages.find(stage => stage.level === level);
}
export const displayCapacity = (state: Pick<EconomyState, 'expansionLevel'>) => expansionStage(state.expansionLevel)?.capacity ?? 3;
export const dailyCustomers = (state: Pick<EconomyState, 'expansionLevel'>) => expansionStage(state.expansionLevel)?.customers ?? 5;
export function nextExpansion(state: Pick<EconomyState, 'expansionLevel'>) {
    const current = expansionStage(state.expansionLevel);
    const next = expansionStage(state.expansionLevel + 1);
    return current && next ? { ...next, price: next.totalCost - current.totalCost } : null;
}

export function expandShop(state: EconomyState): Result {
    const fail = (message: string): Result => ({ ok: false, state, message });
    const current = expansionStage(state.expansionLevel);
    if (!current || state.expansionSpend !== current.totalCost) return fail('확장 정보를 확인해 주세요.');
    const next = nextExpansion(state);
    if (!next) return fail('진열대가 최대 단계까지 확장되었습니다.');
    if (!Number.isSafeInteger(state.gold) || state.gold < next.price) return fail('확장할 골드가 부족합니다.');
    return {
        ok: true, state: { ...state, gold: state.gold - next.price, expansionLevel: next.level, expansionSpend: next.totalCost },
        message: `진열대 ${next.level}단계 확장 · −${next.price}G · 상품별 ${next.capacity}개, 하루 손님 ${next.customers}명`,
    };
}
