import { sellDisplayed } from './economy.ts';
import type { EconomyState, ItemId } from './economy.ts';

export type Customer = Readonly<{
    name: string; itemId: ItemId; budget: number; maxPrice: number; request: string;
}>;
export const customers = [
    { name: '견습 마법사 루나', itemId: 'herb', budget: 50, maxPrice: 45, request: '오늘 밤 실습에 쓸 약초 하나가 필요해요.' },
    { name: '모험가 로웬', itemId: 'potion', budget: 90, maxPrice: 80, request: '숲에 들어가기 전에 체력 물약을 준비하려고요.' },
    { name: '초보 기사 테오', itemId: 'sword', budget: 250, maxPrice: 220, request: '첫 임무에 가져갈 철검을 찾고 있어요.' },
    { name: '채집가 미라', itemId: 'mushroom', budget: 60, maxPrice: 50, request: '오늘의 연구에 쓸 달빛 버섯을 찾고 있어요.' },
    { name: '마법사 셀레네', itemId: 'manaPotion', budget: 120, maxPrice: 110, request: '긴 주문을 준비하려고요. 마나 물약 한 병 있나요?' },
] as const satisfies readonly Customer[];

export type VisitOutcome = Readonly<
    { kind: 'purchased'; price: number; message: string } |
    { kind: 'declined'; reason: 'stock' | 'display' | 'budget' | 'price' | 'transaction'; message: string }
>;
export type CustomerVisit = Readonly<{
    id: number;
    customer: Customer;
    phase: 'arriving' | 'browsing' | 'leaving' | 'completed';
    outcome: VisitOutcome | null;
}>;
export type VisitEvent = 'arrived' | 'decide' | 'departed';

export function createVisit(id: number, customer: Customer = customers[(id - 1) % customers.length]): CustomerVisit {
    if (!Number.isSafeInteger(id) || id < 1) throw new RangeError('방문 번호는 1 이상의 안전한 정수여야 합니다.');
    return { id, customer, phase: 'arriving', outcome: null };
}

export const isVisitActive = (visit: CustomerVisit | null) => visit !== null && visit.phase !== 'completed';

// 시계나 화면에 의존하지 않는다. 판단 시점의 실제 재고와 가격으로 거래한다.
export function decidePurchase(economy: EconomyState, customer: Customer): { economy: EconomyState; outcome: VisitOutcome } {
    const decline = (reason: Extract<VisitOutcome, { kind: 'declined' }>['reason'], message: string) =>
        ({ economy, outcome: { kind: 'declined' as const, reason, message: `${customer.name}: ${message}` } });
    if (economy.inventory[customer.itemId] < 1) return decline('stock', '찾는 상품이 품절이라 구매하지 못했어요.');
    if (economy.displayed[customer.itemId] < 1) return decline('display', '찾는 상품이 진열되어 있지 않아요.');
    const price = economy.prices[customer.itemId];
    if (price > customer.budget) return decline('budget', '가진 골드로는 살 수 없어요.');
    if (price > customer.maxPrice) return decline('price', '생각했던 가격보다 비싸서 다음에 올게요.');
    const result = sellDisplayed(economy, customer.itemId);
    if (!result.ok) return decline('transaction', result.message);
    return { economy: result.state, outcome: { kind: 'purchased', price, message: `${customer.name} 구매 완료 · ${result.message}` } };
}

// 방문 번호와 현재 단계가 모두 일치해야 진행한다. 이전 타이머나 중복 콜백은 무시한다.
export function advanceVisit(economy: EconomyState, visit: CustomerVisit, id: number, event: VisitEvent) {
    if (visit.id !== id) return { economy, visit };
    if (visit.phase === 'arriving' && event === 'arrived') {
        return { economy, visit: { ...visit, phase: 'browsing' as const } };
    }
    if (visit.phase === 'browsing' && event === 'decide') {
        const result = decidePurchase(economy, visit.customer);
        return { economy: result.economy, visit: { ...visit, phase: 'leaving' as const, outcome: result.outcome } };
    }
    if (visit.phase === 'leaving' && event === 'departed') {
        return { economy, visit: { ...visit, phase: 'completed' as const } };
    }
    return { economy, visit };
}
