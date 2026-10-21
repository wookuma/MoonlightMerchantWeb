import { itemValues } from '../../src/domain/economy.ts';

// 과거 저장에 새 메타데이터만 보충하는 기대값. 기존 골드·재고·원가 비교는 유지한다.
export function expectedObjectiveMetadata(day) {
    return {
        craftedInventory: itemValues(() => 0), craftedDisplayed: itemValues(() => 0),
        objectives: {
            firstDay: day.number > 1 || day.phase === 'closed' ? 'ready' : 'in-progress',
            craftedSale: 'in-progress',
            perfectDay: day.phase === 'closed' && day.summary.buyers === day.summary.visitors ? 'ready' : 'in-progress',
        },
    };
}
