import { craft, recipes } from './crafting.ts';
import { items, trade } from './economy.ts';
import type { EconomyState } from './economy.ts';

export function parseQuantity(raw: string, minimum = 1): number | null {
    if (!/^\d+$/.test(raw.trim())) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= minimum ? value : null;
}

const product = (a: number, b: number) => {
    const total = a * b;
    return Number.isSafeInteger(a) && a > 0 && Number.isSafeInteger(b) && b > 0 && Number.isSafeInteger(total) ? total : null;
};

// 실행과 같은 순수 함수로 가능 여부를 확인한다. 미리보기는 상태를 변경하지 않는다.
export function previewTrade(state: EconomyState, id: string, quantity: number) {
    const item = items.find(item => item.id === id);
    return {
        buy: trade(state, 'buy', id, quantity), sell: trade(state, 'sell', id, quantity),
        buyTotal: item ? product(item.buyPrice, quantity) : null,
        sellTotal: item ? product(state.prices[item.id], quantity) : null,
    };
}

export function previewCraft(state: EconomyState, recipeId: string, batches: number) {
    const recipe = recipes.find(recipe => recipe.id === recipeId);
    const result = craft(state, recipeId, batches);
    return {
        result,
        outputQuantity: recipe ? product(recipe.output.quantity, batches) : null,
        materials: recipe ? recipe.ingredients.map(ingredient => ({ itemId: ingredient.itemId, quantity: product(ingredient.quantity, batches) })) : [],
        totalCost: recipe && result.ok ? result.state.inventoryCosts[recipe.output.itemId] - state.inventoryCosts[recipe.output.itemId] : null,
    };
}
