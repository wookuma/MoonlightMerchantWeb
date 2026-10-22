import { getPreparationPlan } from './preparation.ts';
import { trade } from './economy.ts';
import type { EconomyState, Result } from './economy.ts';
import { setDisplayQuantity } from './display.ts';
import { craft } from './crafting.ts';
import type { ShopDay } from './shopDay.ts';

export type PreparationAction = 'display' | 'buy' | 'craft';
type ActionPreview = Readonly<{ quantity: number; cost: number | null; result: Result }>;

// 기존 수요 안내로 수량을 정하고 실제 거래·진열·제작 함수로 검증한다. 미리보기는 저장하지 않는다.
export function previewPreparationAction(economy: EconomyState, day: ShopDay, itemId: string, action: PreparationAction): ActionPreview {
    const fail = (message: string): ActionPreview => ({ quantity: 0, cost: null, result: { ok: false, state: economy, message } });
    if (day.phase !== 'preparing') return fail('준비 도우미의 작업은 영업 준비 시간에만 가능합니다.');
    const row = getPreparationPlan(economy,day.number).rows.find(row => row.item.id === itemId);
    if (!row) return fail('등록되지 않은 상품입니다.');
    if (action === 'display') {
        if (row.fromStorage === 0) return fail(row.toDisplay === 0 ? '이미 예상 수요만큼 진열되어 있습니다.' : '진열할 보관 상품을 먼저 매입하거나 제작해 주세요.');
        return { quantity: row.fromStorage, cost: 0, result: setDisplayQuantity(economy,row.item.id,row.displayed + row.fromStorage) };
    }
    if (action === 'buy') {
        if (row.shortage === 0) return fail('추가 매입 없이 현재 재고로 준비할 수 있습니다.');
        return { quantity: row.shortage, cost: row.directPurchaseCost, result: trade(economy,'buy',row.item.id,row.shortage) };
    }
    if (action === 'craft') {
        const option = row.crafting;
        if (!option) return fail('이 상품은 추가 제작이 필요하지 않거나 제작법이 없습니다.');
        const batches = Math.floor(option.craftableNow / option.recipe.output.quantity);
        if (batches < 1) return fail('오늘 판매할 원재료를 남기면 제작 재료가 부족합니다.');
        const result = craft(economy,option.recipe.id,batches);
        return { quantity: batches * option.recipe.output.quantity, cost: result.ok ? result.state.inventoryCosts[row.item.id] - economy.inventoryCosts[row.item.id] : null, result };
    }
    return fail('올바르지 않은 준비 작업입니다.');
}
