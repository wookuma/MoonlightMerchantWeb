import { useSyncExternalStore } from 'react';
import { items } from '../domain/economy';
import { dailyCustomers } from '../domain/shopExpansion';
import { getShopEvent } from '../domain/shopEvent';
import { getDayPlan } from '../domain/shopDay';
import { gameStore } from '../stores/gameStore';


export function CustomerPanel() {
    const { economy, visit, day } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    if (day.phase === 'closed') return <p className="panel-note">영업이 마감되었습니다. 장부에서 결산을 확인하고 다음 날을 준비해 주세요.</p>;
    const limit = dailyCustomers(economy);
    const open = day.phase === 'open';
    const plan = getDayPlan(day.number, limit);
    const event = getShopEvent(day.number);
    const customer = visit?.customer;
    const item = items.find(entry => entry.id === customer?.itemId);
    return <section className="customer-panel" aria-labelledby="customer-title">
        <div className="customer-summary">
            <span className="eyebrow">{open ? 'WELCOME TO THE SHOP' : 'PREPARE FOR A NEW DAY'}</span>
            <h2 id="customer-title">{open && customer ? customer.name : `${day.number}일차 · 영업 준비`}</h2>
            <p>{open && customer ? `“${customer.request}”` : `상품을 매입·제작한 뒤 진열해 주세요. 손님 ${limit}명이 진열된 상품만 구매합니다.`}</p>
            {open && customer && <span className="customer-preference">찾는 상품: {item?.name} · 예산 {customer.budget}G · 적정가 {customer.maxPrice}G 이하</span>}
            <div className={`shop-event ${event.id}`} aria-labelledby="shop-event-title">
                <span className="eyebrow">오늘의 상점 이벤트</span>
                <h3 id="shop-event-title">{event.title}</h3>
                <p>{event.description}</p>
                <small>{event.id === 'market' ? '날짜별 일상 수요' : '행사에 맞춘 상품별 수요'} · 하루 손님 {limit}명</small>
            </div>
            <div className="demand-forecast">
                <h3>오늘의 예상 수요 <small>총 {limit}명 · {open ? '개점 전 기준' : '상품별 찾는 수량'}</small></h3>
                <div className="day-plan" aria-label="오늘의 예상 수요">{items.map(entry => <span key={entry.id}>{entry.name} <b>{plan.filter(person => person.itemId === entry.id).length}개</b></span>)}</div>
                <p className="demand-note">구매 여부는 진열 재고와 판매가에 따라 달라집니다. 수요는 날짜별로 바뀌며, 확장하면 방문 인원도 늘어납니다.</p>
            </div>
            {visit?.outcome && <p className={`customer-outcome ${visit.outcome.kind === 'purchased' ? 'positive' : 'negative'}`} role="status">{visit.outcome.message}</p>}
        </div>
    </section>;
}
