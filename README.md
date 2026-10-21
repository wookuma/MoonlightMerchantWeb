# Phaser React TypeScript Template

This is a Phaser project template that uses the React framework and Vite for bundling. It includes a bridge for React to Phaser game communication, hot-reloading for quick development workflow and scripts to generate production-ready builds.

**[This Template is also available as a JavaScript version.](https://github.com/phaserjs/template-react)**

### Versions

This template has been updated for:

- [Phaser 4](https://github.com/phaserjs/phaser)
- [React 19.0.0](https://github.com/facebook/react)
- [Vite 6.3.1](https://github.com/vitejs/vite)
- [TypeScript 5.7.2](https://github.com/microsoft/TypeScript)

![screenshot](screenshot.png)

## Requirements

[Node.js](https://nodejs.org) is required to install dependencies and run scripts via `npm`.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install project dependencies |
| `npm run dev` | Launch a development web server |
| `npm run build` | Create a production build in the `dist` folder |
| `npm run dev-nolog` | Launch a development web server without sending anonymous data (see "About log.js" below) |
| `npm run build-nolog` | Create a production build in the `dist` folder without sending anonymous data (see "About log.js" below) |

## Writing Code

After cloning the repo, run `npm install` from your project directory. Then, you can start the local development server by running `npm run dev`.

The local development server runs on `http://localhost:8080` by default. Please see the Vite documentation if you wish to change this, or add SSL support.

Once the server is running you can edit any of the files in the `src` folder. Vite will automatically recompile your code and then reload the browser.

## Template Project Structure

We have provided a default project structure to get you started. This is as follows:

| Path                          | Description                                                                 |
|-------------------------------|-----------------------------------------------------------------------------|
| `index.html`                  | A basic HTML page to contain the game.                                     |
| `src`                         | Contains the React client source code.                                     |
| `src/main.tsx`                | The main **React** entry point. This bootstraps the React application.      |
| `src/PhaserGame.tsx`          | The React component that initializes the Phaser Game and acts as a bridge between React and Phaser. |
| `src/vite-env.d.ts`           | Global TypeScript declarations, providing type information.                |
| `src/App.tsx`                 | The main React component.                                                  |
| `src/game/EventBus.ts`        | A simple event bus to communicate between React and Phaser.                |
| `src/game`                    | Contains the game source code.                                             |
| `src/game/main.tsx`           | The main **game** entry point. This contains the game configuration and starts the game. |
| `src/game/scenes/`            | The folder where Phaser Scenes are located.                                |
| `public/style.css`            | Some simple CSS rules to help with page layout.                            |
| `public/assets`               | Contains the static assets used by the game.                               |

## React Bridge

The `PhaserGame.tsx` component is the bridge between React and Phaser. It initializes the Phaser game and passes events between the two.

To communicate between React and Phaser, you can use the **EventBus.js** file. This is a simple event bus that allows you to emit and listen for events from both React and Phaser.

```js
// In React
import { EventBus } from './EventBus';

// Emit an event
EventBus.emit('event-name', data);

// In Phaser
// Listen for an event
EventBus.on('event-name', (data) => {
    // Do something with the data
});
```

In addition to this, the `PhaserGame` component exposes the Phaser game instance along with the most recently active Phaser Scene using React forwardRef.

Once exposed, you can access them like any regular react reference.

## Phaser Scene Handling

In Phaser, the Scene is the lifeblood of your game. It is where you sprites, game logic and all of the Phaser systems live. You can also have multiple scenes running at the same time. This template provides a way to obtain the current active scene from React.

You can get the current Phaser Scene from the component event `"current-active-scene"`. In order to do this, you need to emit the event `"current-scene-ready"` from the Phaser Scene class. This event should be emitted when the scene is ready to be used. You can see this done in all of the Scenes in our template.

**Important**: When you add a new Scene to your game, make sure you expose to React by emitting the `"current-scene-ready"` event via the `EventBus`, like this:


```ts
class MyScene extends Phaser.Scene
{
    constructor ()
    {
        super('MyScene');
    }

    create ()
    {
        // Your Game Objects and logic here

        // At the end of create method:
        EventBus.emit('current-scene-ready', this);
    }
}
```

You don't have to emit this event if you don't need to access the specific scene from React. Also, you don't have to emit it at the end of `create`, you can emit it at any point. For example, should your Scene be waiting for a network request or API call to complete, it could emit the event once that data is ready.

### React Component Example

Here's an example of how to access Phaser data for use in a React Component:

```ts
import { useRef } from 'react';
import { IRefPhaserGame } from "./game/PhaserGame";

// In a parent component
const ReactComponent = () => {

    const phaserRef = useRef<IRefPhaserGame>(); // you can access to this ref from phaserRef.current

    const onCurrentActiveScene = (scene: Phaser.Scene) => {

        // This is invoked

    }

    return (
        ...
        <PhaserGame ref={phaserRef} currentActiveScene={onCurrentActiveScene} />
        ...
    );

}
```

In the code above, you can get a reference to the current Phaser Game instance and the current Scene by creating a reference with `useRef()` and assign to PhaserGame component.

From this state reference, the game instance is available via `phaserRef.current.game` and the most recently active Scene via `phaserRef.current.scene`.

The `onCurrentActiveScene` callback will also be invoked whenever the the Phaser Scene changes, as long as you emit the event via the EventBus, as outlined above.

## Handling Assets

Vite supports loading assets via JavaScript module `import` statements.

This template provides support for both embedding assets and also loading them from a static folder. To embed an asset, you can import it at the top of the JavaScript file you are using it in:

```js
import logoImg from './assets/logo.png'
```

To load static files such as audio files, videos, etc place them into the `public/assets` folder. Then you can use this path in the Loader calls within Phaser:

```js
preload ()
{
    //  This is an example of an imported bundled image.
    //  Remember to import it at the top of this file
    this.load.image('logo', logoImg);

    //  This is an example of loading a static image
    //  from the public/assets folder:
    this.load.image('background', 'assets/bg.png');
}
```

When you issue the `npm run build` command, all static assets are automatically copied to the `dist/assets` folder.

## Deploying to Production

After you run the `npm run build` command, your code will be built into a single bundle and saved to the `dist` folder, along with any other assets your project imported, or stored in the public assets folder.

In order to deploy your game, you will need to upload *all* of the contents of the `dist` folder to a public facing web server.

## Customizing the Template

### Vite

If you want to customize your build, such as adding plugin (i.e. for loading CSS or fonts), you can modify the `vite/config.*.mjs` file for cross-project changes, or you can modify and/or create new configuration files and target them in specific npm tasks inside of `package.json`. Please see the [Vite documentation](https://vitejs.dev/) for more information.

## About log.js

If you inspect our node scripts you will see there is a file called `log.js`. This file makes a single silent API call to a domain called `gryzor.co`. This domain is owned by Phaser Studio Inc. The domain name is a homage to one of our favorite retro games.

We send the following 3 pieces of data to this API: The name of the template being used (vue, react, etc). If the build was 'dev' or 'prod' and finally the version of Phaser being used.

At no point is any personal data collected or sent. We don't know about your project files, device, browser or anything else. Feel free to inspect the `log.js` file to confirm this.

Why do we do this? Because being open source means we have no visible metrics about which of our templates are being used. We work hard to maintain a large and diverse set of templates for Phaser developers and this is our small anonymous way to determine if that work is actually paying off, or not. In short, it helps us ensure we're building the tools for you.

However, if you don't want to send any data, you can use these commands instead:

Dev:

```bash
npm run dev-nolog
```

Build:

```bash
npm run build-nolog
```

Or, to disable the log entirely, simply delete the file `log.js` and remove the call to it in the `scripts` section of `package.json`:

Before:

```json
"scripts": {
    "dev": "node log.js dev & dev-template-script",
    "build": "node log.js build & build-template-script"
},
```

After:

```json
"scripts": {
    "dev": "dev-template-script",
    "build": "build-template-script"
},
```

Either of these will stop `log.js` from running. If you do decide to do this, please could you at least join our Discord and tell us which template you're using! Or send us a quick email. Either will be super-helpful, thank you.

## Join the Phaser Community!

We love to see what developers like you create with Phaser! It really motivates us to keep improving. So please join our community and show-off your work 😄

**Visit:** The [Phaser website](https://phaser.io) and follow on [Phaser Twitter](https://twitter.com/phaser_)<br />
**Play:** Some of the amazing games [#madewithphaser](https://twitter.com/search?q=%23madewithphaser&src=typed_query&f=live)<br />
**Learn:** [API Docs](https://newdocs.phaser.io), [Support Forum](https://phaser.discourse.group/) and [StackOverflow](https://stackoverflow.com/questions/tagged/phaser-framework)<br />
**Discord:** Join us on [Discord](https://discord.gg/phaser)<br />
**Code:** 2000+ [Examples](https://labs.phaser.io)<br />
**Read:** The [Phaser World](https://phaser.io/community/newsletter) Newsletter<br />

Created by [Phaser Studio](mailto:support@phaser.io). Powered by coffee, anime, pixels and love.

The Phaser logo and characters are &copy; 2011 - 2025 Phaser Studio Inc.

All rights reserved.


## Moonlight Merchant 첫 상점 프로토타입

원본 템플릿 안내는 위에 보존되어 있습니다. 현재 진입 화면은 `ShopScene`입니다.

- 실행: `npm run dev-nolog -- --host 127.0.0.1 --strictPort` → http://127.0.0.1:8080/
- 타입 검사: `npm run typecheck`
- 경제 테스트: `npm test` (현재 Node 23.6.0에서 검증; 추가 테스트 의존성 없음)
- 빌드: `npm run build-nolog`

React는 UI, Phaser는 임시 상점 화면, `src/domain/economy.ts`는 순수 경제 계산을 담당합니다.
`src/stores/gameStore.ts`의 단일 상태를 React와 Phaser가 함께 구독합니다.

보유 골드는 1,000G입니다. 약초 매입을 한 번 누르면 980G·재고 1개, 판매하면 1,015G·재고 0개가 됩니다.
체력 물약과 철검도 거래할 수 있고 상품별 판매가를 입력한 후 적용할 수 있습니다.
골드/재고가 부족하면 메시지가 표시되고 거래 상태는 유지됩니다. Phaser 진열대에는 최대 6개까지 임시 상품 도형을 표시하며 실제 수량은 숫자로 표시합니다.

판매 버튼으로 직접 거래를 시험할 수 있습니다. 손님 5명의 하루 영업과 결산도 구현되어 있습니다. 로컬 자동 저장이 적용되어 같은 주소와 브라우저에서 이어할 수 있습니다.
브라우저 수동 검증: 기본 화면과 위 거래 흐름, 판매가 변경, 재고 없는 판매와 골드 부족, 좁은 창에서 버튼 접근을 확인합니다.


### 하루 영업과 결산

1. 새 게임을 확인한 뒤 약초 2개, 체력 물약 2개, 철검 1개를 매입합니다(총 240G, 잔액 760G).
2. 약초 2개·물약 2개·철검 1개를 `+ 진열`로 올리고, 기본 판매가를 유지한 채 `영업 시작`을 누릅니다.
3. 손님 5명이 한 번에 한 명씩 자동 방문합니다. 약초→물약→철검→약초→물약 순서이며 약 25초 걸립니다.
4. 마지막 손님이 퇴장하면 1일차 결산이 표시됩니다: 방문 5명, 구매 5명, 매출 390G, 판매 원가 240G, 판매 이익 150G, 잔액 1,150G.
5. `다음 날 준비`를 누르면 2일차가 됩니다. 골드·남은 재고·설정한 가격은 유지됩니다.

매입과 직접 판매는 준비 시간에만 가능합니다. 영업 중에는 판매가를 변경할 수 있고, 실제 구매 판단 순간의 가격을 사용합니다.
재고가 없거나 예산·적정가를 초과하면 구매 없이 퇴장하며, 구매 실패도 하루 방문 인원에 포함됩니다.
결산은 영업 시작 시점 이후의 판매만 집계합니다. 준비 중 직접 판매와 이전 날의 거래는 오늘 결산에 포함하지 않습니다.
판매 이익은 판매된 상품 원가만 차감하며, 팔리지 않은 상품의 매입액은 재고로 남습니다. 기존 장부는 누적 수치입니다.
매일 준비 화면에 그날 손님들이 찾을 상품 수량이 표시됩니다. 다음 날에도 손님은 앞선 방문 순서에 이어서 찾아옵니다.
장면 종료 시 이동·대기·구독이 정리되며, 재연결되면 현재 영업 단계부터 진행합니다. 영업 중 새로고침하면 저장된 개점 직전 상태로 돌아옵니다.

수동 확인: 정상 영업, 재고 없이 영업, 약초 판매가 46G로 가격 거절, 영업 중 매입 비활성화와 가격 변경, 마감 후 결산 및 다음 날 재고 유지, 좁은 창에서 결산 버튼 접근을 확인합니다.


### 자동 저장·이어하기

- 최초 로드에서는 저장을 읽기만 합니다. 저장이 없으면 1일차 1,000G로 시작합니다.
- 개점 직전, 하루 마감, 다음 날 준비 시작 때 자동 저장합니다. 준비 중 매입·가격 변경은 다음 개점 때 저장됩니다.
- 날짜, 골드, 재고, 판매가, 누적 실적, 손님 방문 순서, 마감 결산을 저장합니다.
- 영업 중 새로고침하거나 종료하면 해당 날의 개점 직전으로 돌아옵니다. 마감 후 다시 열면 결산 화면이 복원됩니다.
- 같은 브라우저의 같은 주소(예: http://127.0.0.1:8080/)에서 이어합니다. 저장 상태와 오류는 상단에 계속 표시합니다.
- 손상 데이터, 미지원 버전, 다른 창에서 바뀐 저장 데이터는 자동 덮어쓰기하지 않습니다. 자동 저장을 중지한 임시 게임으로 진행하며 기존 값은 보존합니다.
- `새 게임` → 확인창의 `초기화하고 시작`을 선택한 경우에만 기존 저장을 교체합니다. 취소나 Esc는 저장과 진행을 초기화하지 않습니다.
- 새 게임 저장에 실패하면 기존 진행을 유지합니다. 저장 접근 실패나 용량 부족도 앱을 중단시키지 않고 알립니다.
- 저장 형식은 버전 2이며 버전 1 저장도 호환 로드합니다. 저장 처리와 검증은 `src/services/save`에서 검증·브라우저 접근을 분리했습니다. 테스트는 메모리 저장소로 실행하며 실제 사용자 저장을 변경하지 않습니다.

수동 확인: 개점 중 새로고침→개점 직전 복원, 마감 후 새로고침→결산 복원, 다음 날 준비 후 재접속→날짜와 잔여 재고 유지, 새 게임 취소·확인, 응대 중 새 게임 후 중복 판매가 없는지 확인합니다.


### 첫 제작: 약초 2개 → 체력 물약 1개

- 상품 관리 아래 작업대에서 필요한 약초 수량·보유 수량·재료 원가를 확인하고 물약을 1개씩 제작합니다.
- 제작은 영업 준비 시간에만 가능합니다. 재료 부족이나 영업 중 요청은 재고·골드를 바꾸지 않습니다.
- 새 게임 기준 약초 2개 매입: 960G·약초 2개. 제작: 960G·약초 0개·물약 1개. 물약을 65G에 직접 판매하면 1,025G, 판매 원가 40G, 이익 25G입니다.
- 제작은 지불한 재료 원가를 완성품으로 옮깁니다. 매입액·매출·판매 원가를 제작 자체로 늘리지 않습니다. 직접 매입한 상품과 제작품을 같은 재고에서 관리하며 품목별 원가를 나눠 판매 원가를 계산합니다.
- 정수 골드의 나머지는 앞서 소모하는 상품에 1G씩 배분하며, 전량 판매 시 남는 재고 원가는 0입니다.
- 제작 재고와 원가는 개점 직전 자동 저장에 포함됩니다. 영업 중 재접속하면 제작을 마친 개점 직전 상태로 돌아옵니다.
- 버전 1 저장은 기존 고정 매입가로 재고 원가를 복원해 읽습니다. 기존 날짜·골드·재고·가격·실적·결산을 유지하며, 읽을 때는 원본을 바꾸지 않고 다음 자동 저장에 버전 2로 기록합니다. 손상된 구버전이나 모르는 버전은 기존처럼 보호합니다.
- 현재 약초 2개 매입 비용과 물약 직접 매입 비용은 모두 40G입니다. 첫 레시피의 흐름을 검증하기 위한 예시 밸런스입니다.

수동 확인: 준비 중 약초 2개 매입→작업대 제작→약초 0개·물약 1개·골드 유지, 재료 부족 시 비활성화, 영업/마감 중 제작 불가, 제작 후 개점·재접속 시 제작 재고 유지, 기존 저장의 이어하기를 확인합니다.


### 보관과 진열

- 매입·제작한 상품은 보관 재고로 들어갑니다. 상품 카드의 `+ 진열`·`− 회수`로 준비 시간에만 옮깁니다.
- 상품별 최대 3개를 진열하며, 총 재고 안에서 진열 수량을 관리합니다. 보관 = 전체 − 진열이므로 진열/회수 자체는 골드·재고 총수량·원가를 바꾸지 않습니다.
- 손님은 진열한 상품만 구매하고, 영업 중 자동 보충하지 않습니다. 창고에 남아 있어도 진열이 비면 해당 상품을 구매하지 못합니다.
- 직접 판매와 제작은 보관 재고만 사용합니다. 진열한 약초로 제작하려면 먼저 회수해야 하며, 제작한 물약도 판매하려면 진열해야 합니다.
- Phaser 진열대 도형과 숫자는 실제 진열 수량을 표시합니다. 남은 보관·진열 재고는 다음 날 유지하고 개점 직전/마감/다음 날 준비 시 자동 저장합니다.
- 저장 버전 3은 진열 수량을 보존합니다. 버전 1·2 저장은 전체 재고와 원가·날짜·실적을 유지하고, 상품별 최대 3개를 진열한 상태로 읽습니다. 나머지는 보관 재고입니다. 읽기만으로 구버전 원본을 덮어쓰지 않습니다.
- 유료 진열대 확장과 손님 수 증가는 아직 구현하지 않았습니다.

수동 확인: 약초 5개 매입→2개 진열→보관 3/진열 2, 진열 0개로 영업 시 구매 거절, 진열 약초를 제작/직접 판매가 소비하지 않는지, 진열·회수 시 골드 유지, 개점 후 보충 차단, 새로고침/다음 날 수량 유지와 구버전 이어하기를 확인합니다.


### 진열대 확장

준비 시간에 300G를 지불하면 상품별 진열 3→5개·방문 5→7명, 추가 600G를 지불하면 7개·9명으로 확장합니다. 진열 수량은 자동으로 늘지 않습니다. 확장 비용은 판매 이익과 별도로 집계하며 개점 직전 체크포인트에 함께 저장합니다. 저장 버전 4는 기존 1~3을 검증 후 기본 확장 단계로 변환하며, 읽기만으로 원본 저장을 바꾸지 않습니다.


### 날짜별 수요

준비 화면의 오늘의 예상 수요를 보고 상품을 매입·제작·진열합니다. 첫날은 균형 구성이고 2일차부터 날짜별로 인기 상품과 방문 순서가 바뀝니다. 상품별 예상 수요의 합은 확장 단계별 손님 5/7/9명과 같습니다. 예고 수요와 실제 방문은 같은 계획을 사용하며, 구매 성공은 재고·가격 조건에 달려 있습니다. 저장 버전은 4를 유지하며 저장된 날짜·확장 단계로 같은 날의 수요를 재현합니다.


### 놓친 판매 결산

마감 시 상품별 예상 수요·판매·놓친 판매와 실패 이유(품절, 미진열, 예산 초과, 높은 가격, 거래 실패)를 확인할 수 있습니다. 손님이 퇴장할 때 한 번만 기록하며, 결과에 맞춘 다음 날 준비 메모를 표시합니다. 저장 버전 5는 이 결산 상세를 보존하고 버전 1~4도 읽습니다. 구버전 마감에 없는 상세 이유는 추정하지 않고 상세 기록 없음으로 표시합니다. 다음 날에는 새 기록을 시작합니다.


### 상품·제작법 확장

달빛 버섯(매입 25G/판매 40G), 마나 물약(매입 60G/판매 90G)을 추가했습니다. 약초 1개+버섯 1개로 마나 물약 1개를 만들며 원가 45G를 완성품으로 옮깁니다. 첫날은 기존 입문 구성이고 2일차부터 버섯과 마나 물약 손님도 날짜별 수요에 포함됩니다. 상점 진열대와 손님 이동은 5종 좌표를 공유합니다. 저장 버전 6은 버전 1~5를 기존 규칙으로 검증한 후 새 상품 재고·진열·원가를 0으로 보충하며 과거 결산을 보존합니다.


### 준비 도우미

준비 화면에서 상품별 수요·진열·보관 재고, 진열 부족과 추가 준비 수량을 비교할 수 있습니다. 보관 상품을 우선 활용한 뒤 부족분을 직접 매입하는 예상 총액을 표시합니다. 물약별 제작안에는 재료 필요량, 판매용으로 남길 보관분, 제작에 쓸 수량, 현재 제작 가능 수량, 부족 재료 매입 비용을 표시합니다. 각 제작안은 공유 재료가 있는 독립 선택지이며 합산하지 않습니다. 실제 매입·제작·진열은 직접 선택하며 계산은 상태·저장을 바꾸지 않습니다. 저장 버전은 6을 유지합니다.


### 수량 지정 작업

상품별 거래 수량으로 묶음 매입·직접 판매를 하고, 제작법별 횟수로 묶음 제작할 수 있습니다. 거래 버튼에는 요청 총액, 작업대에는 총 필요 재료·완성품 수량·원가 합계를 표시합니다. 목표 진열 수량을 입력해 한 번에 진열하거나 0으로 전량 회수할 수 있습니다. 모든 요청은 현재 골드·보관 재고·한도를 한 번에 검사하며 실패하면 부분 실행하지 않습니다. 준비 시간 제한과 저장 버전 6은 유지합니다. 새 게임에서는 거래·제작 입력도 초기화합니다.


### 초반 목표와 보상

첫 영업 마감 100G, 직접 제작한 물약을 손님에게 판매 150G, 하루 모든 손님에게 판매 200G의 일회성 보상을 제공합니다. 준비·마감 중 수령할 수 있고 현재 상태 저장 성공 후에만 골드·수령 상태를 반영합니다. 저장 실패 시 기존 진행을 유지합니다. 제작품은 진열·회수·판매에서 먼저 처리하며 직접 판매는 제작품 판매 목표에 포함하지 않습니다. 목표 보상은 상품 매출·이익과 별도입니다. 저장 버전 7은 버전 1~6과 호환되며, 구버전에 없는 제작 출처는 추정하지 않습니다.


### 날짜별 상점 이벤트

첫날은 기존 입문 구성입니다. 2일차부터 마법학교 실습일·평온한 장날·모험가 출정일·평온한 장날이 반복됩니다. 실습일에는 약초와 마나 물약 수요가 각각 2/3/4개, 달빛 버섯 수요가 1개입니다. 출정일에는 체력 물약과 철검이 각각 2/3/4개, 약초가 1개입니다. 총 손님 수는 확장 단계별 5/7/9명으로 유지하며 날짜가 같으면 재접속해도 이벤트와 방문 순서가 같습니다. 준비 화면의 이벤트·예상 수요·준비 도우미와 실제 방문이 같은 계획을 사용합니다. 저장 버전은 7을 유지하고 과거 마감 결산은 당시 기록을 보존합니다.


### 상점 중심 화면과 메뉴

기본 화면은 중앙 4:3 상점과 그 폭에 붙은 날짜·골드 HUD, 영업 상태, 관리 메뉴로 구성합니다. 상품 관리(매입·판매 / 진열·가격), 제작, 영업 준비, 퀘스트, 상점 확장, 장부는 모달로 열립니다. 숫자 1~6은 각 메뉴 단축키이며 입력 중에는 작동하지 않습니다. 모달이 열리면 이동·구매 대기 시간을 멈추고 닫으면 남은 시간부터 이어집니다. ESC·닫기·바깥 클릭으로 닫을 수 있고 마감 시 장부를 자동 표시합니다. 게임 메뉴에는 저장 상태와 기존 새 게임 확인창을 유지합니다. 저장 형식과 경제 규칙은 변경하지 않습니다.

상품 관리에서는 매입 뒤 `② 진열·가격`으로 이동해 손님에게 판매할 상품을 진열합니다. 모달 상단에서 상품·제작·준비 확인·장부를 바로 이동할 수 있습니다. 하단 주요 버튼은 준비 확인 → 영업 시작 → 영업 계속하기 → 다음 날 매입·준비 순서로 안내하며, 다음 날 준비 시 상품 관리가 바로 열립니다. 결산은 손님 응대가 끝나면 자동으로 표시됩니다.
