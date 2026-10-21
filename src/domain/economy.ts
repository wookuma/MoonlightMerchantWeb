import { createObjectiveProgress, markObjective } from './objectives.ts';
import type { ObjectiveProgress } from './objectives.ts';

export const items = [
    { id: 'herb', name: '달빛 약초', category: 'HERB', description: '숲의 달빛을 머금은 기본 재료.', buyPrice: 20, sellPrice: 35, color: '#96c9a0' },
    { id: 'potion', name: '체력 물약', category: 'POTION', description: '지친 모험가를 위한 붉은 한 병.', buyPrice: 40, sellPrice: 65, color: '#e99c9c' },
    { id: 'sword', name: '철검', category: 'EQUIPMENT', description: '첫 모험에 든든한 날카로운 동반자.', buyPrice: 120, sellPrice: 190, color: '#acbed6' },
    { id: 'mushroom', name: '달빛 버섯', category: 'MATERIAL', description: '달빛 아래 자라 마력을 품은 연금술 재료.', buyPrice: 25, sellPrice: 40, color: '#c5a0df' },
    { id: 'manaPotion', name: '마나 물약', category: 'POTION', description: '약초와 버섯의 마력을 담은 푸른 한 병.', buyPrice: 60, sellPrice: 90, color: '#8dbde8' },
] as const;

export type ItemId = typeof items[number]['id'];
export const itemValues = (value: (item: typeof items[number]) => number): Record<ItemId, number> =>
    Object.fromEntries(items.map(item => [item.id, value(item)])) as Record<ItemId, number>;

export type EconomyState = Readonly<{
    gold: number;
    objectives: ObjectiveProgress;
    craftedInventory: Readonly<Record<ItemId, number>>;
    craftedDisplayed: Readonly<Record<ItemId, number>>;
    expansionLevel: number;
    expansionSpend: number;
    inventory: Readonly<Record<ItemId, number>>;
    displayed: Readonly<Record<ItemId, number>>;
    inventoryCosts: Readonly<Record<ItemId, number>>;
    prices: Readonly<Record<ItemId, number>>;
    purchaseSpend: number;
    revenue: number;
    costOfGoodsSold: number;
    unitsSold: number;
}>;
export type Result = { ok: true; state: EconomyState; message: string } | { ok: false; state: EconomyState; message: string };

export function createInitialState(): EconomyState {
    return {
        expansionLevel: 0, expansionSpend: 0, objectives: createObjectiveProgress(),
        craftedInventory: itemValues(() => 0), craftedDisplayed: itemValues(() => 0),
        gold: 1000, inventory: itemValues(() => 0),
        displayed: itemValues(() => 0),
        inventoryCosts: itemValues(() => 0),
        prices: itemValues(item => item.sellPrice),
        purchaseSpend: 0, revenue: 0, costOfGoodsSold: 0, unitsSold: 0,
    };
}

const positive = (value: number) => Number.isSafeInteger(value) && value > 0;
const safe = (value: number) => Number.isSafeInteger(value) && value >= 0;
const fail = (state: EconomyState, message: string): Result => ({ ok: false, state, message });

// 품목별 총원가를 수량에 나눈다. 나머지 1G부터 배분해 전량 소모 시 원가가 남지 않게 한다.
// 총원가×수량 곱셈을 피하므로 안전한 정수 범위를 넘는 중간 계산도 없다.
export function consumedInventoryCost(state: EconomyState, id: ItemId, quantity: number): number | null {
    const count = state.inventory[id], total = state.inventoryCosts?.[id];
    if (!positive(quantity) || !positive(count) || quantity > count || !safe(total)) return null;
    return Math.floor(total / count) * quantity + Math.min(total % count, quantity);
}

export const storedQuantity = (state: EconomyState, id: ItemId) => state.inventory[id] - state.displayed[id];

export function trade(state: EconomyState, direction: 'buy' | 'sell', id: string, quantity = 1, source: 'storage' | 'display' = 'storage'): Result {
    const item = items.find(entry => entry.id === id);
    if (!item) return fail(state, '등록되지 않은 상품입니다.');
    if (!positive(quantity)) return fail(state, '수량은 1 이상의 안전한 정수여야 합니다.');
    if (direction !== 'buy' && direction !== 'sell') return fail(state, '올바르지 않은 거래입니다.');
    if ((source !== 'storage' && source !== 'display') || (direction === 'buy' && source !== 'storage')) return fail(state, '올바르지 않은 거래 위치입니다.');
    if (!safe(state.displayed?.[item.id]) || state.displayed[item.id] > state.inventory[item.id]) return fail(state, '진열 수량을 확인해 주세요.');
    const price = direction === 'buy' ? item.buyPrice : state.prices[item.id];
    const amount = price * quantity;
    if (!positive(price) || !positive(amount)) return fail(state, '거래 금액을 확인해 주세요.');
    if (direction === 'buy' && state.gold < amount) return fail(state, '골드가 부족합니다.');
    const available = source === 'display' ? state.displayed[item.id] : storedQuantity(state, item.id);
    if (direction === 'sell' && available < quantity) return fail(state, source === 'display' ? '진열된 상품이 부족합니다.' : '보관 재고가 부족합니다. 진열 상품은 먼저 회수해 주세요.');
    const buying = direction === 'buy';
    if (!safe(state.inventoryCosts?.[item.id])) return fail(state, '재고 원가를 확인해 주세요.');
    const consumedCost = buying ? 0 : consumedInventoryCost(state, item.id, quantity);
    if (consumedCost === null) return fail(state, '재고 원가를 확인해 주세요.');
    const craftedAvailable = source === 'display' ? state.craftedDisplayed[item.id] : state.craftedInventory[item.id] - state.craftedDisplayed[item.id];
    const craftedSold = buying ? 0 : Math.min(quantity, craftedAvailable);
    const next: EconomyState = {
        ...state,
        craftedInventory: { ...state.craftedInventory, [item.id]: state.craftedInventory[item.id] - craftedSold },
        craftedDisplayed: { ...state.craftedDisplayed, [item.id]: state.craftedDisplayed[item.id] - (!buying && source === 'display' ? craftedSold : 0) },
        gold: state.gold + (buying ? -amount : amount),
        inventory: { ...state.inventory, [item.id]: state.inventory[item.id] + (buying ? quantity : -quantity) },
        displayed: { ...state.displayed, [item.id]: state.displayed[item.id] - (!buying && source === 'display' ? quantity : 0) },
        inventoryCosts: { ...state.inventoryCosts, [item.id]: state.inventoryCosts[item.id] + (buying ? amount : -consumedCost) },
        purchaseSpend: state.purchaseSpend + (buying ? amount : 0),
        revenue: state.revenue + (buying ? 0 : amount),
        costOfGoodsSold: state.costOfGoodsSold + (buying ? 0 : consumedCost),
        unitsSold: state.unitsSold + (buying ? 0 : quantity),
    };
    if (![next.gold, next.craftedInventory[item.id], next.craftedDisplayed[item.id], next.inventory[item.id], next.displayed[item.id], next.inventoryCosts[item.id], next.purchaseSpend, next.revenue, next.costOfGoodsSold, next.unitsSold].every(safe)) {
        return fail(state, '거래 가능한 수치 범위를 초과했습니다.');
    }
    return { ok: true, state: source === 'display' && craftedSold > 0 && (item.id === 'potion' || item.id === 'manaPotion') ? markObjective(next, 'craftedSale') : next, message: `${item.name} ${quantity}개 ${buying ? '매입' : '판매'} · ${buying ? '−' : '+'}${amount.toLocaleString('ko-KR')}G` };
}

export const sellDisplayed = (state: EconomyState, id: string, quantity = 1): Result => trade(state, 'sell', id, quantity, 'display');

export function setSalePrice(state: EconomyState, id: string, price: number): Result {
    const item = items.find(entry => entry.id === id);
    if (!item) return fail(state, '등록되지 않은 상품입니다.');
    if (!positive(price)) return fail(state, '판매가는 1 이상의 안전한 정수여야 합니다.');
    return { ok: true, state: { ...state, prices: { ...state.prices, [item.id]: price } }, message: `${item.name} 판매가를 ${price.toLocaleString('ko-KR')}G로 변경했습니다.` };
}
