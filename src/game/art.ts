import type { Scene } from 'phaser';

export const artAssets = {
    interior: { key: 'moonlight-interior-v1', url: '/assets/moonlight/interior-v1.png' },
    characters: { key: 'moonlight-characters-v1', url: '/assets/moonlight/characters-v1.png' },
    luna: { key: 'moonlight-luna-motion-v1', url: '/assets/moonlight/luna-motion-v1.png' },
    rowen: { key: 'moonlight-rowen-motion-v1', url: '/assets/moonlight/rowen-motion-v1.png' },
    theo: { key: 'moonlight-theo-motion-v1', url: '/assets/moonlight/theo-motion-v1.png' },
    mira: { key: 'moonlight-mira-motion-v1', url: '/assets/moonlight/mira-motion-v1.png' },
    selene: { key: 'moonlight-selene-motion-v1', url: '/assets/moonlight/selene-motion-v1.png' },
    icons: { key: 'moonlight-icons-v1', url: '/assets/moonlight/icons-v1.png' },
} as const;

// 실제 상품 수요와 같은 키로 외형을 선택한다. 신규 시트는 0~3 걷기, 4~5 대기, 6~7 반응이다.
export const customerMotions = {
    herb: { asset: artAssets.luna, walk: 'luna-walk-v1', idle: 'luna-idle-v1', walkFrames: [1,2,3,2], facesRight: true },
    potion: { asset: artAssets.rowen, walk: 'rowen-walk-v1', idle: 'rowen-idle-v1', walkFrames: [0,1,2,3], facesRight: true },
    sword: { asset: artAssets.theo, walk: 'theo-walk-v1', idle: 'theo-idle-v1', walkFrames: [0,1,2,3], facesRight: false },
    mushroom: { asset: artAssets.mira, walk: 'mira-walk-v1', idle: 'mira-idle-v1', walkFrames: [0,1,2,3], facesRight: true },
    manaPotion: { asset: artAssets.selene, walk: 'selene-walk-v1', idle: 'selene-idle-v1', walkFrames: [0,1,2,3], facesRight: true },
} as const;

// 원본 이미지를 편집하지 않고 Phaser 프레임으로 나눈다. 나누어떨어지지 않는 크기도 정수 경계를 쓴다.
export function addArtFrames(scene: Scene) {
    const grids = [
        [artAssets.characters.key, 3, 2], [artAssets.icons.key, 4, 3],
        ...Object.values(customerMotions).map(motion => [motion.asset.key, 4, 2] as const),
    ] as const;
    for (const [key, columns, rows] of grids) {
        const texture = scene.textures.get(key);
        const source = texture.getSourceImage();
        for (let index = 0; index < columns * rows; index++) {
            const column = index % columns, row = Math.floor(index / columns);
            const x = Math.floor(column * source.width / columns), y = Math.floor(row * source.height / rows);
            const right = Math.floor((column + 1) * source.width / columns), bottom = Math.floor((row + 1) * source.height / rows);
            texture.add(index, 0, x, y, right - x, bottom - y);
        }
    }
}

export function addCustomerAnimations(scene: Scene) {
    for (const motion of Object.values(customerMotions)) {
        if (!scene.anims.exists(motion.walk)) scene.anims.create({
            key: motion.walk, frames: motion.walkFrames.map(frame => ({ key: motion.asset.key, frame })), frameRate: 8, repeat: -1,
        });
        if (!scene.anims.exists(motion.idle)) scene.anims.create({
            key: motion.idle, frames: [4,4,4,4,4,4,4,5].map(frame => ({ key: motion.asset.key, frame })), frameRate: 4, repeat: -1,
        });
    }
}
