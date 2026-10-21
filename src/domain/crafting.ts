import { consumedInventoryCost, items, storedQuantity } from './economy.ts';
import type { EconomyState, ItemId, Result } from './economy.ts';

type Recipe = Readonly<{
    id: string;
    name: string;
    description: string;
    ingredients: readonly Readonly<{ itemId: ItemId; quantity: number }>[];
    output: Readonly<{ itemId: ItemId; quantity: number }>;
}>;

export const recipes = [
    { id: 'health-potion', name: '체력 물약', description: '약초의 생명력을 작은 병에 담아요.', ingredients: [{ itemId: 'herb', quantity: 2 }], output: { itemId: 'potion', quantity: 1 } },
    { id: 'mana-potion', name: '마나 물약', description: '약초와 달빛 버섯을 섞어 마력을 끌어내요.', ingredients: [{ itemId: 'herb', quantity: 1 }, { itemId: 'mushroom', quantity: 1 }], output: { itemId: 'manaPotion', quantity: 1 } },
] as const satisfies readonly Recipe[];

export function craft(state: EconomyState, recipeId: string, batches = 1): Result {
    const fail = (message: string): Result => ({ ok: false, state, message });
    const recipe = recipes.find(entry => entry.id === recipeId);
    if (!recipe) return fail('등록되지 않은 제작법입니다.');
    if (!Number.isSafeInteger(batches) || batches < 1) return fail('제작 횟수는 1 이상의 안전한 정수여야 합니다.');
    const inventory = { ...state.inventory };
    const inventoryCosts = { ...state.inventoryCosts };
    const craftedInventory = { ...state.craftedInventory };
    let cost = 0;
    for (const ingredient of recipe.ingredients) {
        const required = ingredient.quantity * batches;
        if (!Number.isSafeInteger(required)) return fail('제작 수량이 너무 큽니다.');
        if (storedQuantity(state, ingredient.itemId) < required) return fail(`보관 중인 ${items.find(item => item.id === ingredient.itemId)?.name} 재료가 부족합니다. 진열한 재료는 먼저 회수해 주세요.`);
        const consumed = consumedInventoryCost(state, ingredient.itemId, required);
        if (consumed === null) return fail('재료 원가를 확인해 주세요.');
        cost += consumed;
        const craftedUsed = Math.min(required, state.craftedInventory[ingredient.itemId] - state.craftedDisplayed[ingredient.itemId]);
        craftedInventory[ingredient.itemId] -= craftedUsed;
        inventory[ingredient.itemId] -= required;
        inventoryCosts[ingredient.itemId] -= consumed;
    }
    const output = recipe.output;
    const quantity = output.quantity * batches;
    inventory[output.itemId] += quantity;
    craftedInventory[output.itemId] += quantity;
    inventoryCosts[output.itemId] += cost;
    if (![quantity, cost, craftedInventory[output.itemId], inventory[output.itemId], inventoryCosts[output.itemId]].every(value => Number.isSafeInteger(value) && value >= 0)) {
        return fail('제작 가능한 수치 범위를 초과했습니다.');
    }
    return {
        ok: true, state: { ...state, inventory, inventoryCosts, craftedInventory },
        message: `${recipe.name} ${quantity}개 제작 완료 · 재료 원가 ${cost.toLocaleString('ko-KR')}G`,
    };
}
