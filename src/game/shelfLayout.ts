// 실제 배경의 진열대 위치와 손님의 접근 위치를 공유한다. 800×600 기준.
export const shopEntrance = { x: 400, y: 548 } as const;
export const shelfPosition = (index: number) => ({ x: 66 + index * 116, centerX: 112 + index * 116, customerY: 355 });
