import { useSyncExternalStore } from 'react';
import { items, storedQuantity } from '../domain/economy';
import { DAILY_EXPLORATIONS, forageMaterials } from '../domain/foraging';
import { gameStore } from '../stores/gameStore';
import { gameUiStore } from '../stores/gameUiStore';

export function ForagingPanel() {
    const { economy, day, saveInfo } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const remaining = DAILY_EXPLORATIONS - day.explorationUsed;
    const preparing = day.phase === 'preparing';
    return <section className="foraging-panel" aria-label="재료 수집">
        <div className="foraging-intro"><span className="item-icon herb" aria-hidden="true" /><div><h3>상점을 열기 전, 숲에서 재료를 찾아요</h3><p>약초 또는 버섯을 골라 1개씩 수집합니다. 골드는 소모하지 않아요.</p></div></div>
        <div className="foraging-budget" role="status" aria-live="polite"><span>{day.number}일차 남은 탐색</span><strong>{remaining}<small> / {DAILY_EXPLORATIONS}회</small></strong><span>다음 날 준비 시 다시 {DAILY_EXPLORATIONS}회</span></div>
        {!preparing && <p className="shelf-registration-note">{day.phase === 'open' ? '지금은 영업 중이라 숲에 갈 수 없어요. 영업 마감 후 다음 날 준비에서 탐색해 주세요.' : '오늘 영업이 마감되었습니다. 아래 다음 날 매입·준비 버튼으로 이동하면 다시 탐색할 수 있어요.'}</p>}
        {preparing && remaining === 0 && <p className="shelf-registration-note">오늘의 탐색을 마쳤어요. 수집한 재료를 제작하거나 매대에 진열해 보세요.</p>}
        <div className="foraging-cards">{forageMaterials.map(id => {
            const item = items.find(entry => entry.id === id)!;
            return <article key={id}><span className={`item-icon ${id}`} aria-hidden="true" /><h3>{item.name} 채집</h3><p>{id === 'herb' ? '체력 물약과 마나 물약의 기본 재료입니다.' : '약초와 함께 마나 물약을 만들 수 있어요.'}</p><div>보관 <b>{storedQuantity(economy,id)}개</b> · 진열 {economy.displayed[id]}개</div><button className="open-shop-button" disabled={!preparing || remaining === 0 || saveInfo.status === 'blocked'} onClick={() => gameStore.forage(id)}>1개 채집 · 탐색 1회</button></article>;
        })}</div>
        {saveInfo.status === 'blocked' && <p className="panel-note">저장 데이터 보호로 수집을 멈췄어요. <button className="inline-menu-link" onClick={() => gameUiStore.open('settings')}>저장 상태 확인</button></p>}
        <p className="panel-note">수집 재료는 보관함으로 들어갑니다. 획득 재료와 사용 횟수는 함께 자동 저장하며, 저장 실패 시 둘 다 반영하지 않습니다. 수집 재료의 매입 원가는 0G이며 구매한 재료와 섞이면 기존 원가 배분 규칙을 사용합니다.</p>
        <div className="foraging-next"><button className="workflow-secondary" onClick={() => gameUiStore.open('craft')}>재료로 물약 제작 →</button><button className="workflow-secondary" onClick={() => gameUiStore.open('goods')}>상품 등록·진열 →</button></div>
    </section>;
}
