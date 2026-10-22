import type { VisitOutcome } from '../domain/customerVisit.ts';
import type { EconomyState, ItemId } from '../domain/economy.ts';
import { displayCapacity, dailyCustomers } from '../domain/shopExpansion.ts';
import { getDayStats } from '../domain/shopDay.ts';
import type { ShopDay } from '../domain/shopDay.ts';

const declineSpeech = {
    stock: '찾는 상품이 품절이에요.',
    display: '상품이 진열되어 있지 않아요.',
    budget: '가진 골드가 부족해요.',
    price: '생각했던 가격보다 비싸요.',
    transaction: '거래를 마치지 못했어요.',
} as const;

// 실제 구매 결과를 표현할 뿐 거래를 다시 계산하거나 상태를 저장하지 않는다.
export function visitFeedback(outcome: VisitOutcome | null) {
    if (!outcome) return { speech: '상품을 살펴보는 중…', gain: null };
    return outcome.kind === 'purchased'
        ? { speech: '고마워요!', gain: `+${outcome.price.toLocaleString('ko-KR')}G` }
        : { speech: declineSpeech[outcome.reason], gain: null };
}

export function shelfFeedback(economy: EconomyState, item: ItemId) {
    const count = economy.displayed[item], capacity = displayCapacity(economy);
    if (count === 0) return economy.inventory[item] === 0
        ? { status: 'stockout', label: `품절 · 0/${capacity}개`, color: '#ffc0ac', background: '#492b32' }
        : { status: 'unlisted', label: `미진열 · 보관 ${economy.inventory[item].toLocaleString('ko-KR')}개`, color: '#f1d49c', background: '#403128' };
    return count === 1
        ? { status: 'low', label: `진열 1/${capacity}개 · 마지막`, color: '#ffe3a2', background: '#41332a' }
        : { status: 'ready', label: `진열 ${count}/${capacity}개`, color: '#e5e5c4', background: '#271c2d' };
}

export function liveSales(day: ShopDay, economy: EconomyState) {
    const total = dailyCustomers(economy);
    return { revenue: getDayStats(day,economy).revenue, total, remaining: day.phase === 'closed' ? 0 : Math.max(0,total-day.completedVisits) };
}
