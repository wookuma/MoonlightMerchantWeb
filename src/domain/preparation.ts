import { recipes } from './crafting.ts';
import { items, itemValues, storedQuantity } from './economy.ts';
import type { EconomyState } from './economy.ts';
import { getDayPlan } from './shopDay.ts';
import { dailyCustomers } from './shopExpansion.ts';

// 상태를 바꾸지 않는 준비 안내다. 상품별 제작안은 서로 독립된 선택지다.
export function getPreparationPlan(state: EconomyState, dayNumber: number) {
    const plan = getDayPlan(dayNumber, dailyCustomers(state));
    const demand = itemValues(item => plan.filter(customer => customer.itemId === item.id).length);
    const rows = items.map(item => {
        const displayed = state.displayed[item.id];
        const stored = storedQuantity(state, item.id);
        const toDisplay = Math.max(0, demand[item.id] - displayed);
        const fromStorage = Math.min(toDisplay, stored);
        const shortage = toDisplay - fromStorage;
        const recipe = recipes.find(entry => entry.output.itemId === item.id);
        const crafting = recipe && shortage > 0 ? (() => {
            const batches = Math.ceil(shortage / recipe.output.quantity);
            const materials = recipe.ingredients.map(ingredient => {
                const material = items.find(entry => entry.id === ingredient.itemId)!;
                const stored = storedQuantity(state, ingredient.itemId);
                const reserved = Math.min(stored, Math.max(0, demand[ingredient.itemId] - state.displayed[ingredient.itemId]));
                const available = stored - reserved;
                const required = ingredient.quantity * batches;
                const missing = Math.max(0, required - available);
                return { item: material, required, stored, reserved, available, missing, purchaseCost: missing * material.buyPrice };
            });
            // 필요한 제작 횟수로 먼저 제한하므로 큰 보관 수량도 곱셈 범위를 넘지 않는다.
            const possibleBatches = Math.min(batches, ...recipe.ingredients.map((ingredient, index) => Math.floor(materials[index].available / ingredient.quantity)));
            return {
                recipe, materials, craftableNow: Math.min(shortage, possibleBatches * recipe.output.quantity),
                materialPurchaseCost: materials.reduce((sum, material) => sum + material.purchaseCost, 0),
            };
        })() : null;
        return { item, demand: demand[item.id], displayed, stored, toDisplay, fromStorage, shortage, directPurchaseCost: shortage * item.buyPrice, crafting };
    });
    const directPurchaseCost = rows.reduce((sum, row) => sum + row.directPurchaseCost, 0);
    return {
        rows, directPurchaseCost, goldShortage: Math.max(0, directPurchaseCost - state.gold),
        ready: rows.every(row => row.toDisplay === 0),
    };
}
