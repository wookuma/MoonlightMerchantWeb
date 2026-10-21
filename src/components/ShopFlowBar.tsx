import { useSyncExternalStore } from 'react';
import { getPreparationPlan } from '../domain/preparation';
import { gameStore } from '../stores/gameStore';
import { gameUiStore } from '../stores/gameUiStore';
import { shopFlow } from '../stores/shopFlow';

export function ShopFlowNavigation() {
    const { day, economy } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const { menu } = useSyncExternalStore(gameUiStore.subscribe, gameUiStore.getSnapshot);
    const preparing = day.phase === 'preparing';
    return <div className="shop-flow-navigation">
        <div className="shop-phase"><strong>{day.number}일차 · {preparing ? '영업 준비' : day.phase === 'open' ? '영업 일시정지' : '영업 마감'}</strong><span>{preparing ? '매입·제작 → 진열·가격 → 영업 시작' : day.phase === 'open' ? '매입·제작·진열은 다음 날 가능 · 판매가 변경 가능' : '결산을 확인하고 다음 날로 이동하면 다시 매입할 수 있어요.'}</span><b>{economy.gold.toLocaleString('ko-KR')} G</b></div>
        <nav className="shop-flow-links" aria-label="관리 메뉴 바로 이동">
            {([['goods', '상품·진열'], ['craft', '제작'], ['prepare', '준비 확인'], ['ledger', '매출·결산']] as const).map(([key,label]) => <button key={key} aria-pressed={menu === key} onClick={() => gameUiStore.open(key)}>{label}</button>)}
        </nav>
    </div>;
}

export function ShopFlowAction() {
    const { day, economy } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const { menu } = useSyncExternalStore(gameUiStore.subscribe, gameUiStore.getSnapshot);
    if (menu === 'settings') return <div className="shop-flow-action"><span>ESC로 닫기</span><button className="open-shop-button" onClick={() => gameUiStore.close()}>상점으로 돌아가기</button></div>;
    const preparation = day.phase === 'preparing' ? getPreparationPlan(economy, day.number) : null;
    const missing = preparation?.rows.reduce((sum,row) => sum + row.toDisplay,0) ?? 0;
    return <div className="shop-flow-action">
        <div><strong>{day.phase === 'preparing' ? missing > 0 ? `예상 수요 대비 진열 ${missing}개 부족` : '예상 수요만큼 진열 완료' : day.phase === 'open' ? '메뉴를 닫으면 손님 응대를 계속합니다' : '남은 골드와 재고는 다음 날로 이어집니다'}</strong><small>{day.phase === 'preparing' ? menu === 'prepare' ? missing > 0 ? '지금 영업하면 상품이 부족할 수 있어요. 그대로 시작할 수도 있습니다.' : '판매가에 따라 손님의 구매 여부가 달라집니다.' : '준비 확인에서 수요·진열을 살펴보고 영업을 시작하세요.' : day.phase === 'open' ? '영업은 손님 응대 후 자동으로 마감됩니다.' : '다음 날로 이동하면 상품 관리가 바로 열립니다.'}</small></div>
        <button className="open-shop-button" onClick={() => {
            if (day.phase === 'closed') shopFlow.prepareNextDay();
            else if (day.phase === 'open') gameUiStore.close();
            else if (menu === 'prepare') shopFlow.startTrading();
            else gameUiStore.open('prepare');
        }}>{day.phase === 'closed' ? '다음 날 매입·준비 →' : day.phase === 'open' ? '영업 계속하기 ▸' : menu === 'prepare' ? '영업 시작 ▸' : '준비 확인 →'}</button>
    </div>;
}
