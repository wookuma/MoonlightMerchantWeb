import type { ItemId } from './economy.ts';

type ShopEvent = Readonly<{
    id: 'market' | 'academy' | 'expedition'; title: string; description: string;
    featured: readonly ItemId[]; supporting: ItemId | null;
}>;

const events: Readonly<Record<ShopEvent['id'], ShopEvent>> = {
    market: { id: 'market', title: '평온한 장날', description: '마을 사람들이 각자의 일상을 준비해요. 오늘의 예상 수요를 보고 진열대를 채워보세요.', featured: [], supporting: null },
    academy: { id: 'academy', title: '마법학교 실습일', description: '학생들이 실습을 준비해요. 약초와 마나 물약을 찾는 손님이 많고, 달빛 버섯 수요도 있어요.', featured: ['herb', 'manaPotion'], supporting: 'mushroom' },
    expedition: { id: 'expedition', title: '모험가 출정일', description: '모험가들이 길을 떠나요. 체력 물약과 철검을 찾는 손님이 많고, 약초 수요도 있어요.', featured: ['potion', 'sword'], supporting: 'herb' },
};

// 게임 안의 날짜로 결정한다. 실제 시각·재접속·확장 이력으로 바뀌지 않는다.
export function getShopEvent(dayNumber: number): ShopEvent {
    if (!Number.isSafeInteger(dayNumber) || dayNumber < 1) throw new RangeError('날짜는 1 이상의 안전한 정수여야 합니다.');
    if (dayNumber % 4 === 2) return events.academy;
    if (dayNumber % 4 === 0) return events.expedition;
    return events.market;
}
