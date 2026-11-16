# 오늘의 한강

브라우저에서 한강(여의도~반포)을 걷는 3인칭 힐링 산책 게임. Vite + Three.js, 외부 모델·이미지 없이 전부 코드로 생성.

현재 구현 범위: **1~3단계** (지형·강·대교·노들섬 / 플레이어 이동·카메라 / 시간·날씨·조명)

## 실행

```bash
npm install
npm run dev          # 개발 서버
npm run build        # dist/ (정적 배포용, Vercel 등)
npm run build:single # dist-single/index.html (한 파일로 묶음)
```

## 조작

| 키 | 동작 |
|---|---|
| W A S D / Shift | 걷기 / 달리기 |
| 마우스 / 휠 | 시점 / 줌 |
| E | 상호작용 (편의점 라면·음료·동물 간식, 핫도그, 치킨, 따릉이, 오리배, 한강버스, 먹기, 동물 쓰다듬기·간식 주기, 꽃향기 맡기) |
| F | 벤치나 잔디에 앉기 / 일어나기 (한강버스에서는 좌석) |
| G | 인사 (주변 사람과 맞은편 한강버스 승객이 손을 흔들어 답함) |
| K | 곁에 있는 친구(다른 플레이어)에게 뽀뽀 |
| Q | 물가에서 물수제비 |
| P | 사진 모드 (필터, 화각, 캐릭터 숨기기, Space 촬영, 앨범) |
| M | 지도. 지도를 클릭하거나 아래 바로가기 버튼을 누르면 순간이동 |
| Esc | 메뉴 (화질, 음량, 시간·날씨 미리보기) |

시작 위치는 매번 무작위입니다. 여의도 불꽃놀이는 게임 시간 20:00~21:00(실제 약 75초)에 열립니다. 따릉이는 대여소에서만, 오리배는 오리배 선착장에서만 타고 내립니다. 분수 쇼는 게임 시간 12:30~22:10 사이 매시 정각과 30분 무렵에 열립니다.

## Vercel 배포

1. 이 폴더를 GitHub 저장소에 올립니다.
2. vercel.com → Add New → Project → 저장소 선택.
3. Framework Preset은 Vite로 자동 인식됩니다 (Build `npm run build`, Output `dist`). 환경 변수는 필요 없습니다.
4. Deploy. CLI로는 `npx vercel --prod`.

## 구조

```
src/
  main.js              진입점: 세계 생성 순서, 프레임 루프, 품질 전환, 저장
  config.js            그래픽 품질 프리셋(낮음/중간/높음)
  core/
    math.js            난수·노이즈·보간 (three 비의존)
    state.js           PlayerState(직렬화 가능 → 멀티플레이 확장 지점), 저장소
    input.js           키보드·마우스, 포인터 잠금(막히면 드래그 방식으로 전환)
    textures.js        절차적 노이즈·수면 노멀 텍스처
    geobuilder.js      구조물 지오메트리 빌더(상자·각재·기둥·스윕)
  world/
    geo.js             실제 위·경도 근사 데이터(강변선, 대교, 섬, 광장, 랜드마크)
    field.js           지형 필드: (x,z) → 물가 거리·구역·둔치 폭·높이. 모든 모듈이 공유
    terrain.js         지형 메시(청크·LOD)와 지면 셰이더(산책로·자전거길·호안·젖은 노면)
    water.js           수면 셰이더 + 평면 반사
    bridges.js         대교 7개, 계단, 잠수교, 서래섬 보행교 (계획 단계 / 메시 단계)
    walk.js            보행 판정(지면 + 다리 보도·계단 같은 "띠" 보행면)
    city.js            스카이라인 건물, 랜드마크, 남산·먼 산
    vegetation.js      가을 나무(인스턴싱·LOD)
    props.js           가로등(순차 점등)·벤치
  sky/
    skyglsl.js         하늘·물·안개가 공유하는 하늘색 함수와 유니폼
    sky.js             하늘 돔(해·달·별·구름), 환경맵(IBL)
    environment.js     시간·태양 위치·팔레트·조명·노출
    weather.js         날씨 상태 기계, 빗줄기
  player/
    player.js          캐릭터 모델·애니메이션·이동
    camera.js          3인칭 카메라
  fx/post.js           안개·빛줄기·블룸·톤매핑·FXAA
  ui/                  HUD, 미니맵, 메뉴
tools/                 검증용 스크립트(지형 디버그 맵, 보행 테스트, 스크린샷)
```

## 축척

수평 거리는 실제의 0.4배(약 7km 구간 → 2.9km), 사람·보행로·차로 폭은 1:1.
좌표는 지도 데이터 파일 없이 주요 지점의 위·경도를 직접 근사한 값이다.

## 추가된 모듈 (4~10단계)

- `src/world/wind.js, grassmap.js, grass.js, leaves.js` 바람·풀·억새·낙엽·깃발
- `src/npc/npcs.js` 산책객·러너·자전거·강아지·돗자리·버스커·배달 기사
- `src/world/traffic.js` 대교·강변도로 차량, 지하철
- `src/world/boats.js` 한강버스·오리배·유람선·선착장
- `src/game/facilities.js, interact.js` 따릉이 대여소, 배달존, 푸드트럭, 상호작용
- `src/fx/ripples.js, fountain.js` 물결 고리, 달빛무지개분수
- `src/world/animals.js` 새 떼, 왜가리, 물고기, 날벌레
- `src/audio/audio.js` Web Audio로 만든 환경음·발소리·기타·배경음악
- `src/ui/photo.js` 사진 모드
- `src/fx/fireworks.js, hearts.js`, `src/world/flowers.js` 불꽃놀이, 하트, 코스모스 꽃밭
- `src/world/supercars.js, pigeons.js, extras.js` 잠수교 슈퍼카, 비둘기와 비둘기 할아버지, 글자 조형물·공원 시설·노들섬 건물·무지개

한강버스 갑판에서는 W A S D로 걸어 다니고 E로 웰컴드링크를 마십니다. 일요일(게임 요일) 낮에는 무지개가 뜨고, 메뉴의 미리보기 도구에서 바로 볼 수도 있습니다.
- `src/net/multi.js`, `src/fx/critters.js` 함께 걷기(같은 페이지를 연 사람들의 캐릭터가 서로 보임), 나비·벌·돌고래

함께 걷기는 두 가지 방식으로 동작합니다. Claude 아티팩트 안에서는 room 기능을 쓰고(초대받은 계정만 연결), Vercel 등에 직접 배포한 사이트에서는 공개 MQTT 중계 서버(broker.emqx.io, 예비 broker.hivemq.com)를 써서 계정 없이 같은 주소를 연 모든 사람이 한 방에 모입니다. 공개 중계 서버라 누구나 볼 수 있는 통로이고 가끔 끊길 수 있으니, 오가는 정보는 캐릭터 위치와 자세뿐입니다.

## 모바일

터치 기기에서는 자동으로 화면 조작이 켜집니다. 왼쪽 조이스틱으로 이동(끝까지 밀면 달리기), 화면을 밀어 시점 회전, 두 손가락으로 확대·축소, 오른쪽 버튼으로 E·앉기·인사·뽀뽀·물수제비·달리기 고정, 위쪽 버튼으로 지도·사진·메뉴를 엽니다. 화질은 '낮음'으로 시작하며 가로 화면을 권장합니다.
