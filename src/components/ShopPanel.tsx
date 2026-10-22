import { useState, useSyncExternalStore } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { setDisplayQuantity } from '../domain/display';
import { parseQuantity, previewTrade } from '../domain/orderPreview';
import { items, storedQuantity } from '../domain/economy';
import { displayCapacity } from '../domain/shopExpansion';
import { gameStore } from '../stores/gameStore';

function ProductCard({ item, mode }: { item: typeof items[number]; mode: 'trade' | 'display' }) {
    const { economy, day } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const [draft, setDraft] = useState(String(economy.prices[item.id]));
    const [quantityDraft, setQuantityDraft] = useState('1');
    const [displayDraft, setDisplayDraft] = useState<string | null>(null);
    const capacity = displayCapacity(economy);
    const count = economy.inventory[item.id];
    const displayed = economy.displayed[item.id];
    const stored = storedQuantity(economy, item.id);
    const preparing = day.phase === 'preparing';
    const quantity = parseQuantity(quantityDraft);
    const quote = previewTrade(economy, item.id, quantity ?? NaN);
    const target = parseQuantity(displayDraft ?? String(displayed), 0);
    const displayPreview = setDisplayQuantity(economy, item.id, target ?? NaN);
    function updatePrice(event: FormEvent) {
        event.preventDefault();
        gameStore.setPrice(item.id, Number(draft));
    }
    function updateDisplay(event: FormEvent) {
        event.preventDefault();
        if (target === null) return;
        gameStore.setDisplay(item.id, target);
        if (gameStore.getSnapshot().success) setDisplayDraft(null);
    }
    return <article className="product" style={{ '--item-color': item.color } as CSSProperties}>
        <div className="product-heading">
            <span className={`item-icon ${item.id}`} aria-hidden="true"><i /></span>
            <div><span className="eyebrow">{item.category}</span><h3>{item.name}</h3></div>
            <span className={`stock ${count ? 'in-stock' : ''}`}>전체 <strong>{count}</strong></span>
        </div>
        <p className="product-description">{item.description}</p>
        <div className="product-stockline"><span>보관 <b>{stored}개</b></span><span>진열 <b>{displayed}/{capacity}개</b></span></div>
        {mode === 'display' && <>
        <div className="display-controls">
            {(item.id === 'potion' || item.id === 'manaPotion') && <p className="order-preview">직접 제작 재고 {economy.craftedInventory[item.id]}개 · 진열 중 {economy.craftedDisplayed[item.id]}개</p>}
            <div className="display-actions">
                <button disabled={!preparing || displayed === 0} onClick={() => { gameStore.adjustDisplay(item.id, -1); setDisplayDraft(null); }} aria-label={`${item.name} 진열 1개 회수`}>− 회수</button>
                <button disabled={!preparing || displayed >= capacity || stored === 0} onClick={() => { gameStore.adjustDisplay(item.id, 1); setDisplayDraft(null); }} aria-label={`${item.name} 1개 진열`}>+ 진열</button>
            </div>
        </div>
        <form className="quantity-row display-target" onSubmit={updateDisplay}>
            <label htmlFor={`display-target-${item.id}`}>목표 진열</label>
            <input id={`display-target-${item.id}`} aria-label={`${item.name} 목표 진열 수량`} type="number" min="0" max={Math.min(capacity, count)} step="1" required disabled={!preparing} value={displayDraft ?? String(displayed)} onChange={event => setDisplayDraft(event.target.value)} />
            <span>개</span><button type="submit" disabled={!preparing || !displayPreview.ok || target === displayed}>상품 등록 적용</button>
        </form>
        {preparing && <div className="quantity-presets"><button disabled={displayed === 0} onClick={() => { gameStore.setDisplay(item.id,0); setDisplayDraft(null); }}>모두 회수</button><button disabled={displayed === Math.min(capacity,count)} onClick={() => { gameStore.setDisplay(item.id,Math.min(capacity,count)); setDisplayDraft(null); }}>가능한 만큼 진열</button></div>}
        {preparing && <p className="order-preview">{displayPreview.ok ? `적용 후 진열 ${target}개 · 보관 ${displayPreview.state.inventory[item.id] - displayPreview.state.displayed[item.id]}개` : displayPreview.message}</p>}
        <form className="price-row" onSubmit={updatePrice}>
            <span>매입가 <b>{item.buyPrice}G</b></span>
            <label htmlFor={`price-${item.id}`}>판매가</label>
            <div className="price-input"><input id={`price-${item.id}`} aria-label={`${item.name} 판매가`} disabled={day.phase === 'closed'} type="number" min="1" step="1" required value={draft} onChange={event => setDraft(event.target.value)} /><span>G</span></div>
            <button disabled={day.phase === 'closed'} className="price-apply" type="submit">적용</button>
        </form>
        </>}
        {mode === 'trade' && <>
        <p className="trade-prices">매입 단가 <b>{item.buyPrice}G</b> · 판매 단가 <b>{economy.prices[item.id]}G</b></p>
        <div className="quantity-row">
            <label htmlFor={`trade-quantity-${item.id}`}>거래 수량</label>
            <button disabled={!preparing || quantity === null || quantity <= 1} onClick={() => setQuantityDraft(String(quantity! - 1))} aria-label="거래 수량 1개 줄이기">−</button>
            <input id={`trade-quantity-${item.id}`} aria-label={`${item.name} 거래 수량`} type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" required disabled={!preparing} value={quantityDraft} onChange={event => setQuantityDraft(event.target.value)} /><span>개</span><button disabled={!preparing || quantity === null || quantity >= Number.MAX_SAFE_INTEGER} onClick={() => setQuantityDraft(String(quantity! + 1))} aria-label="거래 수량 1개 늘리기">+</button>
        </div>
        <div className="quantity-presets" aria-label="거래 수량 빠른 선택">{[1,5,10].map(value => <button key={value} disabled={!preparing} aria-pressed={quantity === value} onClick={() => setQuantityDraft(String(value))}>{value}개</button>)}</div>
        <div className="product-actions">
            <button type="button" disabled={!preparing || !quote.buy.ok} onClick={() => { if (quantity !== null) gameStore.buy(item.id, quantity); }} aria-label={`${item.name} ${quantity ?? ''}개 매입`}>매입 <span>{quote.buyTotal === null ? '수량 확인' : `−${quote.buyTotal.toLocaleString('ko-KR')}G`}</span></button>
            <button type="button" disabled={!preparing || !quote.sell.ok} className="sell-button" onClick={() => { if (quantity !== null) gameStore.sell(item.id, quantity); }} aria-label={`${item.name} ${quantity ?? ''}개 보관 재고 판매`}>보관 재고 판매 <span>{quote.sellTotal === null ? '수량 확인' : `+${quote.sellTotal.toLocaleString('ko-KR')}G`}</span></button>
        </div>
        {preparing && <div className="order-preview" aria-live="polite">
            {quantity === null ? <p>수량은 1 이상의 안전한 정수로 입력해 주세요.</p> : <>
                {!quote.buy.ok && <p>매입: {quote.buy.message}</p>}
                {!quote.sell.ok && <p>보관 재고 판매: {quote.sell.message}</p>}
            </>}
        </div>}
        </>}
    </article>;
}

export function ShopPanel({ shelfItem = null }: { shelfItem?: typeof items[number]['id'] | null }) {
    const { economy, day } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const [selected, setSelected] = useState<typeof items[number]['id']>(shelfItem ?? 'herb');
    const [mode, setMode] = useState<'trade' | 'display'>(shelfItem || day.phase !== 'preparing' ? 'display' : 'trade');
    const item = items.find(item => item.id === selected)!;
    return <aside className="shop-panel" aria-label="상품 관리">
        {shelfItem && <p className="shelf-registration-note">{items.find(entry => entry.id === shelfItem)?.name} 매대에서 상품 관리로 들어왔어요. {day.phase === 'preparing' ? '보관 재고를 진열 수량으로 등록해 주세요.' : day.phase === 'open' ? '영업 중에는 판매가를 변경하거나 진열 상태를 확인할 수 있어요.' : '아래 다음 날 매입·준비 버튼을 누르면 상품을 등록할 수 있어요.'}</p>}
        <div className="management-tabs" aria-label="상품 관리 방식"><button aria-pressed={mode === 'trade'} onClick={() => setMode('trade')}>① 매입·재고 정리</button><button aria-pressed={mode === 'display'} onClick={() => setMode('display')}>② 상품 등록·진열</button></div>
        <div className="product-workspace">
            <div className="product-selector" aria-label="상품 선택">{items.map(entry => <button key={entry.id} aria-pressed={selected === entry.id} onClick={() => setSelected(entry.id)} style={{ '--item-color': entry.color } as CSSProperties}><span className={`item-icon ${entry.id}`} aria-hidden="true"><i /></span><span>{entry.name}</span><small>{economy.inventory[entry.id]}개</small></button>)}</div>
            <ProductCard key={item.id} item={item} mode={mode} />
        </div>
        <p className="panel-note">{day.phase === 'preparing' ? '매입한 상품은 보관함에 들어갑니다. ② 상품 등록·진열에서 등록해야 손님이 구매합니다. 보관 재고 판매는 손님 판매와 별개의 즉시 거래입니다.' : day.phase === 'open' ? '영업 중에는 판매가만 변경할 수 있어요. 매입·제작·진열은 영업 마감 후 다음 날 준비에서 가능합니다.' : '오늘 영업이 마감되었습니다. 아래 다음 날 매입·준비 버튼을 누르면 거래할 수 있어요.'}</p>
        {day.phase === 'preparing' && mode === 'display' && <button className="workflow-secondary" onClick={() => setMode('trade')}>재고가 필요하면 · 이 상품 매입하기 →</button>}
        {day.phase === 'preparing' && mode === 'trade' && <button className="workflow-secondary" onClick={() => setMode('display')}>매입 완료 · 상품 등록·진열 →</button>}
    </aside>;
}
