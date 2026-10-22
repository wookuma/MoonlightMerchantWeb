import { useSyncExternalStore } from 'react';
import { items } from '../domain/economy';
import { shelfFeedback } from '../game/salesFeedback';
import { shelfPosition } from '../game/shelfLayout';
import { gameStore } from '../stores/gameStore';
import { gameUiStore } from '../stores/gameUiStore';

// 캔버스와 같은 좌표의 네이티브 버튼. 키보드 조작과 모달을 닫은 뒤 초점 복귀도 지원한다.
export function ShelfHotspots() {
    const { economy, day } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const action = day.phase === 'preparing' ? '상품 등록·진열' : day.phase === 'open' ? '판매가·진열 확인' : '진열 확인·다음 날 준비';
    return <div className="shelf-hotspots" aria-label="매대에서 상품 등록">
        {items.map((item,index) => <button key={item.id} className="shelf-hotspot" data-stock={shelfFeedback(economy,item.id).status} style={{ left: `${(shelfPosition(index).centerX - 52) / 8}%` }}
            aria-haspopup="dialog" aria-label={`${item.name} 매대 · ${shelfFeedback(economy,item.id).label} · ${action}`}
            title={`${item.name} · ${shelfFeedback(economy,item.id).label} · ${action}`} onClick={() => gameUiStore.openShelf(item.id)}><span>{action} ↗</span></button>)}
    </div>;
}
