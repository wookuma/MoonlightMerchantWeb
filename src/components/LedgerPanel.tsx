import { useState, useSyncExternalStore } from 'react';
import { claimedRewardGold } from '../domain/objectives';
import { getDayStats } from '../domain/shopDay';
import { gameStore } from '../stores/gameStore';
import { DaySummary } from './DaySummary';

const gold = (value: number) => value.toLocaleString('ko-KR');
export function LedgerPanel() {
    const { economy, day } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const [tab, setTab] = useState<'today' | 'total'>('today');
    const stats = getDayStats(day, economy);
    return <section className="ledger-panel" aria-label="상점 장부">
        <div className="management-tabs" aria-label="장부 보기"><button aria-pressed={tab === 'today'} onClick={() => setTab('today')}>오늘 매출·결산</button><button aria-pressed={tab === 'total'} onClick={() => setTab('total')}>누적 장부</button></div>
        {tab === 'today' ? day.phase === 'closed' && day.summary ? <DaySummary summary={day.summary} report={day.report} /> : <>
            <h3>{day.number}일차 · {day.phase === 'open' ? '영업 중간 현황' : '영업 준비'}</h3>
            <dl className="summary-grid"><div><dt>방문 완료</dt><dd>{stats.visitors}<small> 명</small></dd></div><div><dt>구매 손님</dt><dd>{stats.buyers}<small> 명</small></dd></div><div><dt>오늘 매출</dt><dd>{gold(stats.revenue)}<small> G</small></dd></div><div><dt>판매 원가</dt><dd>{gold(stats.costOfGoodsSold)}<small> G</small></dd></div><div><dt>판매 이익</dt><dd>{gold(stats.profit)}<small> G</small></dd></div></dl>
            <p className="panel-note">마감하면 상품별 놓친 판매와 다음 날 준비 메모를 확인할 수 있어요.</p>
        </> : <>
            <h3>누적 거래 현황</h3>
            <dl className="summary-grid"><div><dt>전체 재고</dt><dd>{Object.values(economy.inventory).reduce((sum, count) => sum + count, 0)}<small> 개</small></dd></div><div><dt>매입액</dt><dd>{gold(economy.purchaseSpend)}<small> G</small></dd></div><div><dt>판매 매출</dt><dd>{gold(economy.revenue)}<small> G</small></dd></div><div><dt>판매 이익</dt><dd>{gold(economy.revenue - economy.costOfGoodsSold)}<small> G</small></dd></div><div><dt>퀘스트 보상</dt><dd>{gold(claimedRewardGold(economy.objectives))}<small> G</small></dd></div><div><dt>상점 확장 비용</dt><dd>{gold(economy.expansionSpend)}<small> G</small></dd></div></dl>
            <p className="panel-note">판매 이익 = 매출 − 판매된 상품의 원가. 보상과 확장 비용은 별도로 집계합니다.</p>
        </>}
    </section>;
}
