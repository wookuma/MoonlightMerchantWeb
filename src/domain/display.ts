import { displayCapacity } from './shopExpansion.ts';
import { items } from './economy.ts';
import type { EconomyState, Result } from './economy.ts';

export const DISPLAY_LIMIT = 3;

export function setDisplayQuantity(state: EconomyState, id: string, quantity: number): Result {
    const fail = (message: string): Result => ({ ok: false, state, message });
    const item = items.find(entry => entry.id === id);
    if (!item) return fail('등록되지 않은 상품입니다.');
    if (!Number.isSafeInteger(quantity) || quantity < 0) return fail('진열 수량은 0 이상의 정수여야 합니다.');
    const capacity = displayCapacity(state);
    if (quantity > capacity) return fail(`상품별 최대 ${capacity}개까지 진열할 수 있어요.`);
    if (quantity > state.inventory[item.id]) return fail('진열할 보관 재고가 부족합니다.');
    const delta = quantity - state.displayed[item.id];
    const craftedDelta = delta >= 0
        ? Math.min(delta, state.craftedInventory[item.id] - state.craftedDisplayed[item.id])
        : -Math.min(-delta, state.craftedDisplayed[item.id]);
    return {
        ok: true, state: { ...state, craftedDisplayed: { ...state.craftedDisplayed, [item.id]: state.craftedDisplayed[item.id] + craftedDelta }, displayed: { ...state.displayed, [item.id]: quantity } },
        message: `${item.name} 진열 ${quantity}/${capacity}개 · 보관 ${state.inventory[item.id] - quantity}개`,
    };
}
