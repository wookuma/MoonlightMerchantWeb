import { useSyncExternalStore } from 'react';
import { liveSales } from '../game/salesFeedback';
import { gameStore } from '../stores/gameStore';

export function LiveSalesHud() {
    const { economy, day } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const sales = liveSales(day,economy);
    return <section className="stage-sales-hud" aria-label="오늘 영업 현황">
        <dl><div><dt>오늘 매출</dt><dd>{sales.revenue.toLocaleString('ko-KR')}<small> G</small></dd></div><div><dt>{day.phase === 'preparing' ? '예상 손님' : '남은 손님'}</dt><dd title={day.phase === 'open' ? '현재 응대 중인 손님을 포함한 남은 인원' : undefined}>{sales.remaining}<small> / {sales.total}명</small></dd></div></dl>
        {day.phase === 'open' && <p>현재 응대 중인 손님 포함</p>}
    </section>;
}
