import { useSyncExternalStore } from 'react';
import { previewPreparationAction } from '../domain/preparationActions';
import { getPreparationPlan } from '../domain/preparation';
import { gameStore } from '../stores/gameStore';

const gold = (value: number) => value.toLocaleString('ko-KR');

export function PreparationPanel({ onNavigate }: { onNavigate: (menu: 'goods' | 'craft' | 'forest') => void }) {
    const { economy, day, revision } = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
    if (day.phase !== 'preparing') return null;
    const preparation = getPreparationPlan(economy, day.number);
    const craftingRows = preparation.rows.filter(row => row.crafting !== null);
    return <section className="preparation-panel" aria-labelledby="preparation-title">
        <button className="workflow-secondary forest-preparation-link" onClick={() => onNavigate('forest')}>골드 없이 재료 준비 · 숲 탐색 →</button>
        <div className="preparation-heading">
            <div><span className="eyebrow">PLAN YOUR STOCK</span><h2 id="preparation-title">오늘의 준비 도우미</h2></div>
            <span>{preparation.ready ? '수요만큼 진열 완료' : '보관 재고부터 진열해 보세요'}</span>
        </div>
        <div className="report-table-wrap"><table className="report-table preparation-table">
            <caption>오늘 수요와 현재 재고를 비교한 준비 목록</caption>
            <thead><tr><th scope="col">상품</th><th scope="col">수요</th><th scope="col">현재 재고</th><th scope="col">남은 준비</th></tr></thead>
            <tbody>{preparation.rows.map(row => {
                const display = previewPreparationAction(economy,day,row.item.id,'display');
                const buy = previewPreparationAction(economy,day,row.item.id,'buy');
                const craft = previewPreparationAction(economy,day,row.item.id,'craft');
                return <tr key={row.item.id}>
                <th scope="row">{row.item.name}</th><td>{row.demand}개</td>
                <td>진열 {row.displayed}개<span>보관 {row.stored}개</span></td>
                <td>{row.demand === 0 ? '오늘 수요 없음' : row.toDisplay === 0 ? <span className="preparation-ready">✓ 진열 준비 완료</span> : <>
                    <strong>진열 {row.toDisplay}개 부족</strong>
                    {row.fromStorage > 0 && <span>보관에서 {row.fromStorage}개 진열 가능</span>}
                    {row.shortage > 0 && <span>추가 준비 {row.shortage}개 · 직접 매입 시 {gold(row.directPurchaseCost)}G</span>}
                    <div className="preparation-row-actions">
                        {row.fromStorage > 0 && <button disabled={!display.result.ok} onClick={() => gameStore.prepareItem(row.item.id,'display',revision)}><span>보관 {display.quantity}개 진열</span><small>골드 소모 없음</small></button>}
                        {row.shortage > 0 && <button disabled={!buy.result.ok} onClick={() => gameStore.prepareItem(row.item.id,'buy',revision)}><span>부족 {buy.quantity}개 매입</span><small>−{gold(buy.cost ?? 0)}G · 보관함으로</small></button>}
                        {row.crafting && <button disabled={!craft.result.ok} onClick={() => gameStore.prepareItem(row.item.id,'craft',revision)}><span>{craft.quantity > 0 ? `${craft.quantity}개 제작` : '제작 재료 부족'}</span><small>{craft.result.ok ? `재료 원가 ${gold(craft.cost ?? 0)}G · 골드 소모 없음` : '원재료 판매분은 남겨둡니다'}</small></button>}
                    </div>
                    {row.shortage > 0 && !buy.result.ok && <span className="preparation-action-error">{buy.result.message}</span>}
                    {row.fromStorage > 0 && !display.result.ok && <span className="preparation-action-error">{display.result.message}</span>}
                    {row.crafting && craft.quantity > 0 && !craft.result.ok && <span className="preparation-action-error">{craft.result.message}</span>}
                </>}</td>
            </tr>;
            })}</tbody>
        </table></div>
        <div className="preparation-budget">
            <p>부족한 완제품·상품을 모두 직접 매입하면 <strong>{gold(preparation.directPurchaseCost)}G</strong></p>
            <span>{preparation.goldShortage > 0 ? `보유 골드보다 ${gold(preparation.goldShortage)}G 부족` : '현재 골드로 직접 매입 가능'} · 제작안의 재료 비용은 아래에서 별도 비교</span>
        </div>
        {craftingRows.length > 0 && <div className="preparation-recipes">
            <h3>부족한 물약을 제작한다면</h3>
            <p className="preparation-note">오늘 원재료 수요를 채울 보관분과 진열 재료를 제외한 계산입니다. 제작안은 각각의 선택지이며, 같은 약초를 함께 사용하므로 동시에 가능한 수량이나 총비용을 뜻하지 않습니다. 제작 버튼은 현재 가능한 수량만 보관함에 만듭니다. 실행하면 다른 제작안도 즉시 다시 계산합니다.</p>
            <div className="preparation-options">{craftingRows.map(row => {
                const option = row.crafting!;
                return <article key={row.item.id}>
                    <h4>{row.item.name} {row.shortage}개 추가 준비</h4>
                    <p>판매용 재료를 남기면 현재 <strong>{option.craftableNow}개 제작 가능</strong></p>
                    <ul>{option.materials.map(material => <li key={material.item.id}>
                        <b>{material.item.name} {material.required}개 필요</b>
                        <span>보관 {material.stored}개 중 판매용 {material.reserved}개 · 제작에 사용 가능 {material.available}개</span>
                        <span>{material.missing > 0 ? `추가 매입 ${material.missing}개 · ${gold(material.purchaseCost)}G` : '추가 매입 없이 재료 준비 가능'}</span>
                    </li>)}</ul>
                    <p>부족 재료 매입 예상 <strong>{gold(option.materialPurchaseCost)}G</strong></p>
                </article>;
            })}</div>
        </div>}
        <p className="preparation-note">버튼을 누르면 표시된 수량으로 한 작업만 실행합니다. 매입·제작 후에는 진열 버튼을 눌러 주세요. 준비 내용은 기존 자동 저장 시점에 저장합니다. 수량 기준 안내이며 구매 성공은 판매가에도 영향을 받습니다. <button className="inline-menu-link" onClick={() => onNavigate('goods')}>상품 관리</button>에서 매입·진열하거나 <button className="inline-menu-link" onClick={() => onNavigate('craft')}>연금술 작업대</button>에서 직접 제작해 주세요.</p>
    </section>;
}
