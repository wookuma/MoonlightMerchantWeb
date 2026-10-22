# Moonlight Merchant 아트 v1

승인된 방향: 달빛이 들어오는 나무 상점, 보라색 직물, 황동 장식, 표정과 의상이 구분되는 픽셀아트 캐릭터.

내장 image_gen으로 생성했으며 원본 PNG를 편집하지 않고 사용한다. 생성 프롬프트 전문은 `art-prompts-v1.json`, 승인 시안은 `art-concept-v1.png`에 보관한다. 시안은 분위기 참고이며 최종 게임의 진열 재고와 글자는 별도로 표시한다.

## 게임에서 사용하는 파일

- `public/assets/moonlight/interior-v1.png`: 1448×1086, 4:3 배경. 상품과 인물이 없는 빈 진열대.
- `public/assets/moonlight/characters-v1.png`: 1536×1024 RGBA, 3열×2행, 프레임 512×512. 루나·로웬·테오·미라·셀레네·상점 주인 순서.
- `public/assets/moonlight/icons-v1.png`: 1448×1086 RGBA, 4열×3행, 프레임 362×362. 약초·체력 물약·철검·버섯·마나 물약·상품·제작·준비·퀘스트·확장·장부·달 문장 순서.

Phaser 프레임은 `src/game/art.ts`, 상점 위치는 `src/game/shelfLayout.ts`, React 아이콘은 `public/style.css`에서 같은 격자를 사용한다. 손님의 상품에 따라 캐릭터 프레임을 선택하고 실제 진열 수량만큼 상품을 표시한다. 움직임은 기존 방문 타이머를 유지한다. 현재 손님은 별도의 [동작 스프라이트](customer-motion-v1.md)를 사용하며 이 정지 포즈 시트는 초상화와 상점 주인에 사용한다.

생성 PNG에는 실제 알파 채널이 있으며 캐릭터·아이콘 외곽이 투명하다. 원본을 압축하거나 격자를 바꾸면 Phaser와 CSS 양쪽의 좌표를 함께 확인한다. PNG 안에 인터페이스 글자를 합성하지 않는다.
