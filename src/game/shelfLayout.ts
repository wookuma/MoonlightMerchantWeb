// 상품 진열과 손님의 접근 위치가 같은 좌표를 사용한다.
export const shelfPosition = (index: number) => ({ x: 84 + index * 132, centerX: 136 + index * 132, customerY: 383 });
