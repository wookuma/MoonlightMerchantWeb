import type { CSSProperties } from 'react';
import { useState, useSyncExternalStore } from 'react';
import { recipes } from '../domain/crafting';
import { items, storedQuantity } from '../domain/economy';
import { parseQuantity, previewCraft } from '../domain/orderPreview';
import { gameStore } from '../stores/gameStore';

function RecipeCard({ recipe }: { recipe: typeof recipes[number] }) {
    const { economy, day } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    const [draft, setDraft] = useState('1');
    const batches = parseQuantity(draft);
    const quote = previewCraft(economy, recipe.id, batches ?? NaN);
    const output = items.find(item => item.id === recipe.output.itemId)!;
    const preparing = day.phase === 'preparing';
    return <article className="recipe">
        <div className="recipe-output"><span className={`item-icon ${output.id}`} style={{ '--item-color': output.color } as CSSProperties} aria-hidden="true"><i /></span><div><h3>{recipe.name} {quote.outputQuantity ?? '—'}개</h3><p>{recipe.description}</p></div></div>
        <div className="quantity-row">
            <label htmlFor={`craft-batches-${recipe.id}`}>제작 횟수</label>
            <input id={`craft-batches-${recipe.id}`} aria-label={`${recipe.name} 제작 횟수`} type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" required disabled={!preparing} value={draft} onChange={event => setDraft(event.target.value)} /><span>회</span>
        </div>
        <ul className="recipe-materials">{quote.materials.map(ingredient => <li key={ingredient.itemId}><span>{items.find(item => item.id === ingredient.itemId)?.name}</span><span>필요 {ingredient.quantity ?? '수량 확인'}개 · 보관 <b>{storedQuantity(economy, ingredient.itemId)}</b>개</span></li>)}</ul>
        <p className="crafting-cost">재료 원가 합계 <b>{quote.totalCost === null ? '재료·횟수 확인 후 계산' : `${quote.totalCost.toLocaleString('ko-KR')}G`}</b> · 골드 추가 소모 없음</p>
        {preparing && !quote.result.ok && <p className="order-preview" aria-live="polite">{batches === null ? '제작 횟수는 1 이상의 안전한 정수로 입력해 주세요.' : quote.result.message}</p>}
        <button className="craft-button" disabled={!preparing || !quote.result.ok} onClick={() => { if (batches !== null) gameStore.craft(recipe.id, batches); }}>{!preparing ? '영업 준비 중 제작 가능' : `${recipe.name} ${quote.outputQuantity ?? '—'}개 제작`}</button>
    </article>;
}

export function CraftingPanel() {
    return <section className="crafting-panel" aria-labelledby="crafting-title">
        <span className="eyebrow">A LITTLE ALCHEMY</span>
        <h2 id="crafting-title">작은 연금술 작업대</h2>
        {recipes.map(recipe => <RecipeCard key={recipe.id} recipe={recipe} />)}
        <p className="panel-note">제작은 골드 대신 재료를 사용합니다. 진열한 재료는 회수 후 사용할 수 있어요. 완성품은 보관 재고로 들어가며 개점할 때 함께 저장돼요.</p>
    </section>;
}
