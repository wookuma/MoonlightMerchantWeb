import { useSyncExternalStore } from 'react';
import { dailyCustomers, displayCapacity, nextExpansion } from '../domain/shopExpansion';
import { gameStore } from '../stores/gameStore';

export function ExpansionPanel() {
    const { economy, day } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const next = nextExpansion(economy);
    const preparing = day.phase === 'preparing';
    return <section className="expansion-panel" aria-labelledby="expansion-title">
        <div>
            <span className="eyebrow">GROW YOUR SHOP</span>
            <h2 id="expansion-title">진열대 확장 · {economy.expansionLevel}단계</h2>
            <p>현재 상품별 {displayCapacity(economy)}개 진열 · 하루 손님 {dailyCustomers(economy)}명</p>
            <p>{next ? `다음 단계: 상품별 ${next.capacity}개 · 손님 ${next.customers}명 · 비용 ${next.price}G` : '최대 단계입니다. 넓어진 진열대를 채워보세요.'}</p>
            <small>누적 확장 비용 {economy.expansionSpend.toLocaleString('ko-KR')}G · 준비 중에만 확장 가능 · 개점할 때 저장</small>
        </div>
        <div className="expansion-action">
            <button disabled={!preparing || !next || economy.gold < next.price} onClick={() => gameStore.expandShop()}>
                {next ? `진열대 확장 −${next.price}G` : '최대 확장 완료'}
            </button>
            {next && <span>{!preparing ? '다음 영업 준비 시간에 확장할 수 있어요' : economy.gold < next.price ? `골드 ${next.price - economy.gold}G 부족` : '확장 후에도 상품은 직접 진열해 주세요'}</span>}
        </div>
    </section>;
}
