// 저장 버전 1~5 검증 전용. 현재 상품과 수요 변경이 과거 저장의 의미를 바꾸지 않게 고정한다.
import type { EconomyState as CurrentEconomy } from '../../domain/economy.ts';
import type { Customer } from '../../domain/customerVisit.ts';
export const items = [
    { id: 'herb', name: '달빛 약초', category: 'HERB', description: '숲의 달빛을 머금은 기본 재료.', buyPrice: 20, sellPrice: 35, color: '#96c9a0' },
    { id: 'potion', name: '체력 물약', category: 'POTION', description: '지친 모험가를 위한 붉은 한 병.', buyPrice: 40, sellPrice: 65, color: '#e99c9c' },
    { id: 'sword', name: '철검', category: 'EQUIPMENT', description: '첫 모험에 든든한 날카로운 동반자.', buyPrice: 120, sellPrice: 190, color: '#acbed6' },
] as const;

type LegacyItemId = typeof items[number]['id'];
export type EconomyState = Omit<CurrentEconomy, 'inventory' | 'displayed' | 'inventoryCosts' | 'prices' | 'objectives' | 'craftedInventory' | 'craftedDisplayed'> & {
    inventory: Record<LegacyItemId, number>; displayed: Record<LegacyItemId, number>;
    inventoryCosts: Record<LegacyItemId, number>; prices: Record<LegacyItemId, number>;
};
const CUSTOMERS_PER_DAY = 5;
export const customers = [
    { name: '견습 마법사 루나', itemId: 'herb', budget: 50, maxPrice: 45, request: '오늘 밤 실습에 쓸 약초 하나가 필요해요.' },
    { name: '모험가 로웬', itemId: 'potion', budget: 90, maxPrice: 80, request: '숲에 들어가기 전에 체력 물약을 준비하려고요.' },
    { name: '초보 기사 테오', itemId: 'sword', budget: 250, maxPrice: 220, request: '첫 임무에 가져갈 철검을 찾고 있어요.' },
] as const satisfies readonly Customer[];

export function getDayPlan(dayNumber = 1, limit: number = CUSTOMERS_PER_DAY): readonly Customer[] {
    if (!Number.isSafeInteger(dayNumber) || dayNumber < 1) throw new RangeError('날짜는 1 이상의 안전한 정수여야 합니다.');
    if (limit !== 5 && limit !== 7 && limit !== 9) throw new RangeError('하루 손님 수는 5·7·9명이어야 합니다.');
    // 첫날은 기본 상품을 차례로 경험하는 균형 구성이다.
    if (dayNumber === 1) return Array.from({ length: limit }, (_, index) => customers[index % customers.length]);

    let seed = dayNumber % 0x100000000;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
    const featured = (dayNumber - 2) % customers.length;
    const extra = limit - customers.length;
    const focused = Math.ceil(extra * 0.6);
    const plan: Customer[] = [...customers];
    for (let i = 0; i < focused; i++) plan.push(customers[featured]);
    for (let i = focused; i < extra; i++) plan.push(customers[(featured + 1 + Math.floor(random() * 2)) % customers.length]);
    // 방문 순서는 날짜로 결정한 난수로 섞고, 예고와 실제 방문이 이 배열을 공유한다.
    for (let i = plan.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [plan[i], plan[j]] = [plan[j], plan[i]];
    }
    return plan;
}
