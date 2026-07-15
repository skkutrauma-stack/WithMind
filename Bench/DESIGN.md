# 마음곁 Jelly Pop Design System

> Version 1.3 · Working Draft · 2026-07-15  
> Source of truth: [마음곁 젤리팝 브랜드북 v3.4](./마음곁_젤리팝_브랜드북_v3.4.docx)  
> Open decisions: [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)

## 1. Overview

이 문서는 마음곁 모바일 앱의 시각·인터랙션 구현 기준이다. 브랜드북이 브랜드의 이유와 태도를 정의한다면, DESIGN.md는 이를 색상·서체·간격·컴포넌트·상태·화면 패턴으로 변환한다.

### Product experience goal

마음곁은 감정을 잘 설명하지 못하는 14–19세 청소년이 빈 페이지 앞에서 막히지 않도록, 짧은 EMA 선택에서 감정 캐릭터와 질문형 일기로 자연스럽게 이동하게 돕는다.

### Design principles

1. **한 번에 하나만 묻는다.** 한 화면에는 질문 하나 또는 주 행동 하나만 강하게 보인다.
2. **감정을 판정하지 않는다.** 결과는 진단이 아니라 오늘의 상태를 비추는 은유다.
3. **밝지만 가볍게 소비하지 않는다.** 파스텔과 캐릭터를 사용하되 고통을 게임처럼 포장하지 않는다.
4. **선택권을 돌려준다.** 건너뛰기·끄기·나중에 하기·직접 수정하기를 제공한다.
5. **색만으로 말하지 않는다.** 상태는 색 + 라벨 + 형태 + 문장으로 함께 전달한다.
6. **안전이 브랜드보다 우선한다.** 위기 신호에서는 Safety Quiet Mode가 모든 일반 토큰을 덮어쓴다.

### Scope

- iOS·Android 공통의 모바일 우선 명세
- 기본 설계 프레임: 390 × 844pt
- 지원 폭 가정: 320–479pt, 태블릿은 후속 범위
- v1은 Light Mode 기준이며 Dark Mode는 미확정 사항이다.
- 플랫폼별 코드 이름은 기술 스택 확정 후 매핑한다.

## 2. Source hierarchy

충돌이 생기면 다음 우선순위를 따른다.

1. 임상·법률·개인정보·안전 검토
2. 본 DESIGN.md의 Safety Quiet Mode
3. 본 DESIGN.md의 토큰과 컴포넌트 명세
4. 브랜드북 v3.4의 브랜드 방향
5. 개별 화면 시안

## 3. Token naming

토큰은 역할 기반으로 이름 짓는다. 화면 코드에 hex, 임의 간격, 임의 radius를 직접 넣지 않는다.

```text
{category.role.variant.state}

{color.bg.canvas}
{color.action.primary.default}
{type.body.md}
{space.4}
{radius.card}
{shadow.card}
{motion.enter.character}
{component.button.primary}
```

### Rules

- 팔레트 이름은 원색을 보존하는 primitive token에만 사용한다.
- 컴포넌트는 semantic token만 참조한다.
- 상태 접미사는 `.default`, `.pressed`, `.focused`, `.disabled`, `.loading`, `.error`, `.selected` 순서를 사용한다.
- 모든 값은 토큰을 통해 변경 가능해야 한다.

## 4. Color system

### 4.1 Primitive palette

| Token | Value | Role |
|---|---:|---|
| `{color.primitive.canvas}` | `#FFF9FE` | 기본 화면 배경 |
| `{color.primitive.surface}` | `#FFFFFF` | 카드·입력·버튼 표면 |
| `{color.primitive.ink}` | `#4A3550` | 브랜드 기본 잉크 |
| `{color.primitive.ink-strong}` | `#3B2A40` | 액센트 위 접근성 텍스트 |
| `{color.primitive.text-secondary}` | `#6F5A76` | 본문 보조 텍스트 |
| `{color.primitive.muted}` | `#B08FC0` | 장식·큰 라벨 전용, 일반 본문 금지 |
| `{color.primitive.lavender}` | `#A98BE8` | 선택·진행·브랜드 액센트 |
| `{color.primitive.lavender-deep}` | `#7A63C8` | 링크·작은 강조 텍스트 |
| `{color.primitive.lavender-soft}` | `#EDE4FA` | 선택 전 카드·배지 |
| `{color.primitive.lavender-mist}` | `#F6F1FC` | 방사형 배경·섹션 구분 |
| `{color.primitive.sky}` | `#7FA8F0` | 호흡·에너지·진행 |
| `{color.primitive.sky-bright}` | `#5AB0E8` | 선택점·아이콘 강조 |
| `{color.primitive.sky-soft}` | `#DBEFFB` | 연한 상태 표면 |
| `{color.primitive.coral}` | `#FF8A6B` | 감정 선택·기록 진입점 |
| `{color.primitive.coral-deep}` | `#FF6F5C` | 장식 강조, 작은 텍스트 금지 |
| `{color.primitive.coral-soft}` | `#FFE5DE` | 따뜻한 안내 표면 |
| `{color.primitive.pink}` | `#FF6F86` | 결과·캐릭터 액센트 |
| `{color.primitive.pink-soft}` | `#FFDCE8` | 결과·캐릭터 배경 |
| `{color.primitive.mint}` | `#7FC8A8` | 회복·완료·긍정 변화 |
| `{color.primitive.mint-deep}` | `#59C9B0` | 완료 아이콘·장식 강조 |
| `{color.primitive.mint-soft}` | `#DBF3EC` | 완료·안내 표면 |
| `{color.primitive.logo-tile}` | `#C9BAED` | 앱 아이콘 타일 |
| `{color.primitive.logo-companion}` | `#FFAD9D` | 작은 조약돌 |
| `{color.primitive.line}` | `#EDE4FA` | 구분선·비활성 테두리 |

`#6F5A76`과 `#3B2A40`은 브랜드 팔레트를 변경하지 않고 접근 가능한 텍스트 조합을 만들기 위해 파생한 구현 토큰이다.

### 4.2 Semantic colors

| Token | Value | Use |
|---|---:|---|
| `{color.bg.canvas}` | `{color.primitive.canvas}` | 화면 전체 |
| `{color.bg.section}` | `{color.primitive.lavender-mist}` | 섹션·EMA 배경 |
| `{color.surface.card}` | `{color.primitive.surface}` | 기본 카드 |
| `{color.surface.selected}` | `{color.primitive.lavender-soft}` | 선택 상태 표면 |
| `{color.surface.emotion}` | `{color.primitive.coral-soft}` | 감정 관련 안내 |
| `{color.surface.character}` | `{color.primitive.pink-soft}` | 캐릭터 결과 |
| `{color.surface.recovery}` | `{color.primitive.mint-soft}` | 완료·회복 안내 |
| `{color.text.primary}` | `{color.primitive.ink}` | 제목·본문 |
| `{color.text.secondary}` | `{color.primitive.text-secondary}` | 설명·메타데이터 |
| `{color.text.decorative}` | `{color.primitive.muted}` | 큰 날짜·장식 라벨 |
| `{color.text.on-accent}` | `{color.primitive.ink-strong}` | 파스텔 액센트 버튼 텍스트 |
| `{color.text.link}` | `{color.primitive.lavender-deep}` | 링크·텍스트 행동 |
| `{color.border.default}` | `{color.primitive.line}` | 카드·입력 경계 |
| `{color.focus.ring}` | `{color.primitive.lavender-deep}` | 키보드·보조기술 포커스 |

### 4.3 Gradients

```css
--gradient-primary: linear-gradient(90deg, #A98BE8 0%, #7FA8F0 100%);
--gradient-emotion: linear-gradient(90deg, #FF8A6B 0%, #FF6F86 100%);
--gradient-character: linear-gradient(90deg, #FF6F86 0%, #A98BE8 100%);
--gradient-screen-glow:
  radial-gradient(circle at 50% 0%, rgba(169,139,232,.18), transparent 46%),
  #FFF9FE;
```

- 그라데이션은 화면당 최대 1개의 Hero card 또는 Primary action에만 사용한다.
- 액센트 그라데이션 위 텍스트는 `{color.text.on-accent}`를 사용한다.
- 흰색 텍스트는 현재 파스텔 그라데이션에서 충분한 대비를 만들지 못하므로 사용하지 않는다.
- 여러 카드에 서로 다른 그라데이션을 배치하지 않는다.

### 4.4 Area ratio

- 흰색·Mist Canvas: 화면 면적의 70% 이상
- 파스텔 표면: 약 20%
- 선명한 액센트: 10% 이내

## 5. Typography

### 5.1 Font family

| Role | Font stack | Use |
|---|---|---|
| Display | `Jua, Pretendard, system-ui, sans-serif` | 질문·인사·캐릭터 이름 |
| UI / Body | `Pretendard, system-ui, -apple-system, sans-serif` | 본문·버튼·입력·안전 화면 |

- Jua는 1–2줄의 짧은 문장에만 사용한다.
- 긴 일기, 개인정보, 동의, AI 코멘트는 Pretendard를 사용한다.
- Pretendard weight는 400 / 500 / 600 세 단계만 사용한다.
- Safety Quiet Mode의 버튼과 본문에는 Jua를 사용하지 않는다.

### 5.2 Type scale

| Token | Font | Size / Line | Weight | Use |
|---|---|---:|---:|---|
| `{type.display.lg}` | Jua | `32 / 39` | 400 | 홈 인사·대표 질문 |
| `{type.display.md}` | Jua | `28 / 35` | 400 | EMA 질문·캐릭터 이름 |
| `{type.heading.lg}` | Pretendard | `24 / 31` | 600 | 화면 제목 |
| `{type.heading.md}` | Pretendard | `20 / 27` | 600 | 카드 제목 |
| `{type.heading.sm}` | Pretendard | `18 / 25` | 600 | 소제목 |
| `{type.body.lg}` | Pretendard | `17 / 26` | 400 | 주요 설명·코멘트 |
| `{type.body.md}` | Pretendard | `16 / 24` | 400 | 기본 본문 |
| `{type.body.sm}` | Pretendard | `14 / 21` | 400 | 보조 설명 |
| `{type.label.md}` | Pretendard | `14 / 20` | 600 | 버튼·선택 라벨 |
| `{type.label.sm}` | Pretendard | `12 / 17` | 500 | 메타데이터·진행 단계 |
| `{type.caption}` | Pretendard | `11 / 16` | 400 | 제한적 캡션 |

### 5.3 Typography rules

- 기본 본문은 16pt 미만으로 내리지 않는다.
- 11–12pt는 날짜·진행 단계 등 짧은 보조 정보에만 사용한다.
- 제목은 최대 2줄, 본문은 한 문단 4줄 이내를 권장한다.
- 버튼 라벨은 한 줄로 유지하고 2줄이 되면 문구를 줄인다.
- 글자 확대 시 고정 높이 카드 대신 콘텐츠 높이를 늘린다.

## 6. Layout and spacing

### 6.1 Spacing scale

| Token | Value | Use |
|---|---:|---|
| `{space.0}` | `0` | 없음 |
| `{space.1}` | `4` | 아이콘 내부·미세 조정 |
| `{space.2}` | `8` | 밀접한 라벨·아이콘 |
| `{space.3}` | `12` | 카드 사이 최소 간격 |
| `{space.4}` | `16` | 기본 컴포넌트 간격 |
| `{space.5}` | `20` | 화면 좌우 여백·카드 패딩 |
| `{space.6}` | `24` | 섹션·Hero card 패딩 |
| `{space.8}` | `32` | 큰 섹션 구분 |
| `{space.10}` | `40` | 화면 상단 호흡 |
| `{space.12}` | `48` | 주요 영역 분리 |
| `{space.16}` | `64` | 대형 빈 공간 |

### 6.2 Screen geometry

- 기준 폭: 390pt
- 화면 좌우 여백: 20pt
- 360pt 미만: 16pt
- 400pt 이상: 24pt
- 콘텐츠 최대 폭: 430pt
- 카드 간격: 12pt
- 주요 섹션 간격: 24–32pt
- 화면 하단 행동 영역은 Safe Area 위에 12pt 이상 여유를 둔다.
- 키보드가 나타나면 현재 질문·입력·주 행동이 동시에 보이도록 스크롤한다.

### 6.3 Density

- 한 화면의 일반 카드 수는 3개 이하를 권장한다.
- Hero card는 화면당 1개만 허용한다.
- 캐릭터가 화면의 중심이면 장식 원·배지·그라데이션을 줄인다.
- 필수 행동과 `건너뛰기`는 시각적으로 분리하되 둘 다 찾을 수 있어야 한다.

## 7. Shape system

| Token | Value | Use |
|---|---:|---|
| `{radius.sm}` | `12` | 작은 배지·아이콘 표면 |
| `{radius.control}` | `20` | 버튼·입력 컨트롤 |
| `{radius.card}` | `24` | 기본 카드 |
| `{radius.card-lg}` | `28` | 큰 정보 카드 |
| `{radius.hero}` | `32` | Hero·캐릭터 결과 카드 |
| `{radius.sheet}` | `32 32 0 0` | Bottom sheet 상단 |
| `{radius.pill}` | `999` | 칩·상태 배지 |
| `{radius.full}` | `50%` | 원형 선택점 |

- 같은 화면에서 3개 이상의 radius 단계를 섞지 않는다.
- 직각 카드와 날카로운 삼각형을 주요 UI 형태로 사용하지 않는다.

## 8. Elevation and glow

```css
--shadow-card: 0 8px 24px rgba(74, 53, 80, 0.08);
--shadow-hero: 0 16px 40px rgba(74, 53, 80, 0.14);
--shadow-floating: 0 10px 28px rgba(74, 53, 80, 0.12);
--glow-selected: 0 0 0 6px rgba(169, 139, 232, 0.16),
                 0 8px 20px rgba(122, 99, 200, 0.16);
```

| Level | Token | Use |
|---|---|---|
| 0 | 없음 | 화면 배경·Quiet Mode |
| 1 | `{shadow.card}` | 일반 카드 |
| 2 | `{shadow.floating}` | 프로필·플로팅 행동 |
| 3 | `{shadow.hero}` | 화면당 하나의 Hero card |

- 카드 테두리와 강한 그림자를 동시에 사용하지 않는다.
- Safety Quiet Mode는 Level 0–1만 사용한다.

## 9. Icon, logo and illustration

### 9.1 Icons

- 기본 크기: 24 × 24pt
- 선 굵기: 1.75pt
- Stroke cap / join: round
- 작은 아이콘의 최소 터치 영역: 44 × 44pt
- 의료기구·상처·날카로운 물체·위협적인 경고 삼각형을 장식 아이콘으로 사용하지 않는다.
- 상태 아이콘에는 텍스트 라벨을 함께 제공한다.

### 9.2 Logo

- 큰 조약돌은 사용자, 작은 조약돌은 마음곁을 나타낸다.
- 두 조약돌은 겹치지 않고 시각적으로 열린 간격을 유지한다.
- 각 조약돌은 약 2° 안쪽으로 기울어 기대는 인상을 만든다.
- 로고에는 얼굴이나 감정 표정을 넣지 않는다.
- 타일 없는 심볼은 흰색 또는 Mist Canvas 위에서만 사용한다.

### 9.3 Character visual grammar

모든 감정 캐릭터는 서로 다른 사물이지만 하나의 세계에서 나온 것처럼 보여야 한다.

- 1:1 정사각형 아트보드
- 둥근 젤리 클레이 재질, 평면색 중심
- 캐릭터당 주요 색상 2–3개
- 동일한 점눈·작은 입·타원형 바닥 그림자
- 복잡한 손발·사실적 질감·굵은 외곽선 금지
- 같은 카드 안에서 캐릭터 높이와 눈 위치를 광학적으로 통일
- 부정적 캐릭터에도 회복 가능성을 나타내는 작은 단서 1개 포함
- 캐릭터는 진단명·성격 유형·사용자의 정체성으로 명명하지 않는다.

### 9.4 Asset naming

```text
logo_appicon_light.png
logo_symbol_lavender.svg
char_sun_pebble_default.webp
char_cloud_cushion_default.webp
char_water_pot_default.webp
char_radio_default.webp
char_tense_balloon_default.webp
char_tangled_earphones_default.webp
loading_universal_static_390x844.png
loading_universal_motion_reference.gif
```

- 정적 기본 포맷: SVG 또는 투명 WebP/PNG
- 권장 마스터 크기: 1024 × 1024px
- 앱 내 기본 표시: 240–320pt
- 애니메이션 포맷은 기술 스택 확정 후 결정한다.
- 로딩 GIF는 타이밍 확인용이며 실제 앱은 로고·점·토큰을 이용해 네이티브로 구현한다.

## 10. Motion

| Token | Duration | Easing | Use |
|---|---:|---|---|
| `{motion.feedback.tap}` | `160–220ms` | ease-out | 탭·선택 피드백 |
| `{motion.transition.card}` | `280–360ms` | ease-out | 카드·화면 전환 |
| `{motion.enter.character}` | `320–420ms` | spring, low bounce | 캐릭터 최초 등장 |
| `{motion.quiet.fade}` | `240–320ms` | ease-out | Safety Quiet Mode |

- 탭 시 `scale 1 → 0.98 → 1` 이내로 제한한다.
- 화면 이동 거리는 8–12pt 이내로 제한한다.
- 캐릭터는 한 번만 호흡하듯 등장하며 무한 점프·반복 흔들림을 사용하지 않는다.
- 오류·위기 상황에 진동·급팝업·강한 흔들림을 사용하지 않는다.
- Reduce Motion이 켜져 있으면 모든 이동·spring을 단순 fade로 바꾼다.

## 11. Core components

### 11.1 Button

#### Primary

```text
height: 52pt
min-width: 120pt
horizontal-padding: 20pt
radius: 20pt
background: {gradient.primary} or {gradient.emotion}
label: {type.label.md}
label-color: {color.text.on-accent}
```

- 화면당 Primary button은 1개다.
- Default: gradient 100%
- Pressed: scale 0.98, overlay `rgba(59,42,64,.06)`
- Focused: 2pt `{color.focus.ring}` + 2pt 외부 간격
- Disabled: surface `{color.primitive.lavender-soft}`, text `{color.text.secondary}`, shadow 없음
- Loading: 라벨 유지 또는 동일 폭 progress indicator, 중복 탭 차단

#### Secondary

```text
height: 52pt
background: #FFFFFF
border: 1pt {color.border.default}
label-color: {color.text.primary}
radius: 20pt
```

#### Text action

- 최소 터치 영역 44 × 44pt
- `{type.label.md}` + `{color.text.link}`
- `건너뛰기`, `나중에`, `직접 수정하기`에 사용한다.

### 11.2 Cards

#### Standard card

```text
background: {color.surface.card}
radius: 24pt
padding: 20pt
shadow: {shadow.card}
```

#### Hero card

```text
background: {gradient.primary}
radius: 32pt
padding: 24pt
shadow: {shadow.hero}
max-per-screen: 1
```

#### Quiet card

- Safety Quiet Mode 전용
- 단색 표면, 테두리 1pt, shadow 없음 또는 Level 1
- 캐릭터·배지·그라데이션 금지

### 11.3 Input and journal field

```text
min-height: 128pt
background: #FFFFFF
border: 1pt {color.border.default}
radius: 24pt
padding: 16pt
text: {type.body.md}
placeholder: {color.text.secondary}
```

- 빈칸만 제시하지 않고 질문 또는 문장 시작점을 함께 제공한다.
- placeholder를 라벨 대신 사용하지 않는다.
- Focused: 2pt `{color.focus.ring}`
- Error: 붉은색만 사용하지 않고 오류 문장과 수정 행동을 제공한다.
- 임시 저장 상태를 텍스트로 표시한다.

### 11.4 Progress

```text
height: 8pt
track: {color.primitive.lavender-soft}
fill: {gradient.primary}
radius: 999pt
```

- `STEP 2 / 4`처럼 현재 단계 텍스트를 함께 제공한다.
- 남은 시간을 확정적으로 예측하지 않는다.

### 11.5 Chips and badges

- 높이: 28–32pt
- 좌우 패딩: 12pt
- radius: pill
- 선택 전: 연한 표면 + 진한 텍스트
- 선택 후: 선명한 색만으로 구분하지 않고 check 또는 라벨 변화를 추가한다.

### 11.6 Bottom navigation

```text
content-height: 64pt
safe-area: platform inset
background: rgba(255,255,255,.94)
top-border: 1pt {color.border.default}
icon: 22–24pt
label: {type.label.sm}
```

- 현재 기본 정보 구조: 홈 · 기록 · 세션 · 변화 · SOS
- 각 항목 터치 영역: 최소 48 × 48pt
- 선택 상태는 아이콘·라벨 굵기·색을 함께 변경한다.
- SOS는 눈에 띄되 빨간색·경고 아이콘으로 공포를 유발하지 않는다.
- 최종 탭 구조는 `DESIGN_DECISIONS.md`의 D-06에서 확정한다.

### 11.7 Bottom sheet and modal

- 일반 선택은 Bottom sheet를 우선한다.
- 파괴적·중요한 결정만 Modal을 사용한다.
- 닫기 버튼 44 × 44pt, swipe 외에 명시적 닫기 행동을 제공한다.
- 위기 안내는 닫을 수 없는 강제 모달로 만들지 않는다.

### 11.8 Feedback states

| State | Visual | Copy |
|---|---|---|
| Loading | 11.9의 공통 전체화면 로딩 | `준비하고 있어` · `잠시만 기다려줘` |
| Empty | 연한 일러스트 + 한 행동 | 실패나 미달로 표현하지 않음 |
| Error | 아이콘 + 문장 + 재시도 | 사용자의 잘못으로 표현하지 않음 |
| Offline | 저장 가능 범위와 제한 표시 | 전화 행동은 가능한 경우 유지 |
| Saved | 작은 mint 확인 | 과도한 축하 모션 없음 |

### 11.9 Universal full-screen loading

초기 실행·로그인·저장·기록 불러오기·AI 코멘트 생성·안전레이어 진입까지 하나의 로딩 화면을 공통 사용한다.

```text
background: {color.bg.canvas} + subtle lavender/sky radial glow
center-symbol: primary pebble app symbol, 96pt
title: "준비하고 있어" · {type.display.sm}
description: "잠시만 기다려줘" · {type.body.md}
indicator: three 8pt dots, 16pt gap
character: none
action: none
```

- 로고와 문구는 크기·위치·투명도를 바꾸지 않고 완전히 고정한다.
- 세 점만 위치를 움직이지 않고 `900ms` 동안 왼쪽부터 차례로 밝아지는 opacity fade를 반복한다.
- Reduce Motion에서는 로고와 점을 모두 정지시키고 시스템의 indeterminate progress semantics만 유지한다.
- 스크린리더 라벨은 `불러오는 중`이며 반복 루프마다 다시 읽지 않는다.
- 실제 진행률을 모르면 퍼센트를 표시하지 않는다.
- 제품이 정한 제한 시간을 넘으면 무한 로딩을 유지하지 않고 별도 오류 화면과 `다시 시도` 행동으로 전환한다.
- Safety Quiet Mode에서도 같은 구조를 사용하므로 캐릭터·코랄 CTA·축하 모션을 넣지 않는다.
- 개발은 화면 PNG를 그대로 배경으로 사용하지 않고 로고 에셋과 토큰으로 네이티브 구현한다.
- 개발 전달용 `loading_universal_motion_reference.gif`는 세 점의 반복 속도와 밝기 변화 확인에만 사용한다.

## 12. EMA components

### 12.1 Question card

- 질문은 한 화면에 하나만 표시한다.
- 질문은 Jua `{type.display.md}`, 보조 문장은 Pretendard `{type.body.sm}`을 사용한다.
- 상단 progress와 하단 다음 행동을 고정된 위치에 둔다.
- 답하지 않고 넘어갈 수 있는 선택지를 제공한다.

### 12.2 Five-point scale

| Position | Visual diameter | Hit area |
|---:|---:|---:|
| 1 | 18pt | 48pt |
| 2 | 26pt | 48pt |
| 3 | 36pt | 48pt |
| 4 | 46pt | 52pt |
| 5 | 56pt | 56pt |

- 선택점 간 hit area는 겹치지 않아야 한다.
- 양끝에 `거의 없음 / 매우 큼`처럼 의미 라벨을 제공한다.
- 선택 상태는 ring + 크기 + 라벨 또는 접근성 상태값으로 전달한다.
- 숫자 점수는 기본 화면에 노출하지 않아도 되지만 스크린리더 값에는 포함한다.
- 드래그가 아닌 단일 탭으로 모든 값을 선택할 수 있어야 한다.

### 12.3 Current EMA axes

1. 기분: 불편 ↔ 편안
2. 버거움·에너지: 고갈 ↔ 여유
3. 연결감: 혼자 ↔ 함께

정확한 질문 문구·척도 방향·점수 계산은 임상 검토 후 확정한다.

### 12.4 Final emotion vocabulary

아래 7개 대분류와 35개 소분류는 확정된 사용자 어휘다. 표시 문구와 저장값에서 동의어로 교체하거나 어미를 바꾸지 않는다.

| 대분류 | 소분류 1 | 소분류 2 | 소분류 3 | 소분류 4 | 소분류 5 |
|---|---|---|---|---|---|
| 분노 | 답답하다 | 불만스럽다 | 짜증나다 | 신경질 나다 | 화나다 |
| 놀람 | 호기심 생기다 | 신기하다 | 감탄하다 | 당황하다 | 충격받다 |
| 기쁨 | 편안하다 | 기대된다 | 즐겁다 | 뿌듯하다 | 행복하다 |
| 불편함 | 어색하다 | 찝찝하다 | 억울하다 | 밉다 | 불쾌하다 |
| 슬픔 | 서운하다 | 속상하다 | 실망하다 | 외롭다 | 우울하다 |
| 두려움 | 걱정스럽다 | 불안하다 | 초조하다 | 긴장된다 | 무섭다 |
| 무기력함 | 심심하다 | 지루하다 | 피곤하다 | 귀찮다 | 의욕이 없다 |

#### Data contract

표시 문구와 별도로 안정적인 영문 ID를 저장한다. ID는 분석·마이그레이션을 위한 값이며 사용자에게 노출하지 않는다.

```json
{
  "majorEmotionId": "sadness",
  "majorEmotionLabel": "슬픔",
  "minorEmotionIds": ["lonely", "disappointed"],
  "minorEmotionLabels": ["외롭다", "실망하다"],
  "taxonomyVersion": "emotion-ko-1.0"
}
```

| 대분류 | ID | 소분류 ID 순서 |
|---|---|---|
| 분노 | `anger` | `stifled`, `dissatisfied`, `irritated`, `touchy`, `angry` |
| 놀람 | `surprise` | `curious`, `amazed`, `impressed`, `flustered`, `shocked` |
| 기쁨 | `joy` | `comfortable`, `anticipating`, `delighted`, `proud`, `happy` |
| 불편함 | `discomfort` | `awkward`, `uneasy`, `wronged`, `resentful`, `displeased` |
| 슬픔 | `sadness` | `hurt`, `upset`, `disappointed`, `lonely`, `depressed_feeling` |
| 두려움 | `fear` | `worried`, `anxious`, `restless`, `tense`, `afraid` |
| 무기력함 | `lethargy` | `bored_idle`, `bored`, `tired`, `bothered`, `unmotivated` |

- `depressed_feeling`은 사용자가 선택한 일상 감정어 `우울하다`를 저장하기 위한 ID이며 의학적 진단을 뜻하지 않는다.
- 대분류는 탐색과 그룹화를 위한 값이지 강도·위험도·건강 점수가 아니다.
- 감정어 선택과 위기 탐지는 별도 로직으로 유지한다.

### 12.5 Emotion selector

35개 단어를 한 화면에 동시에 노출하지 않는다. 권장 흐름은 대분류를 먼저 탐색하고, 선택한 대분류의 소분류 5개를 펼치는 progressive disclosure 방식이다.

```text
Step A: 대분류 7개 탐색
→ Step B: 선택한 대분류의 소분류 5개 표시
→ Step C: 선택 결과 확인·직접 수정
```

#### Major emotion chip

```text
min-height: 44pt
horizontal-padding: 16pt
radius: 20pt
label: {type.label.md}
default: white + 1pt border
selected: lavender-soft surface + check icon
```

#### Minor emotion card

```text
min-height: 52pt
padding: 14pt 16pt
radius: 20pt
label: exact approved emotion term
selected: 2pt lavender-deep ring + selected icon
```

- 대분류별 고정색을 위험도나 강도로 해석하지 않게 한다.
- 선택 상태는 색 외에 check·테두리·접근성 상태를 함께 제공한다.
- 감정어가 맞지 않을 때 `잘 모르겠어` 또는 건너뛰기 경로를 제공할지 별도 확정한다.
- 대분류·소분류 최대 선택 개수와 혼합 선택 방식은 `DESIGN_DECISIONS.md`의 D-03에서 확정한다.
- `우울하다`, `무섭다`, `충격받다`를 선택했다는 이유만으로 안전 화면으로 자동 전환하지 않는다.

## 13. Character result

### 13.1 Selection model

```text
clinically reviewed safety gate
→ triggered: Safety Quiet Mode, no character
→ passed: calculate one EMA result type
→ map EMA result type to one core character

selected emotion cards
→ emotion labels and a more specific journal question only
→ never change the EMA type or character
```

- 안전 분기는 캐릭터 분류보다 항상 먼저 실행한다.
- EMA 평가 결과 유형과 핵심 캐릭터는 아래 확정 표에 따라 1:1로 연결한다.
- 선택한 감정카드, 기록 맥락, 최근 캐릭터 노출은 `coreCharacterId`를 바꾸지 못한다.
- 감정카드는 사용자용 감정 라벨과 후속 일기 질문을 구체화하는 데만 사용한다.
- 같은 유형 안의 표정·소품 variant는 허용하지만 캐릭터의 의미와 이름은 유지한다.
- 사용자는 결과를 숨기거나 다른 표현을 선택할 수 있어야 한다.
- 내부 Node, 성인 말단 비율, 학력, `역기능적 대처`라는 용어와 위험 추정값은 사용자 화면에 노출하지 않는다.

### 13.2 Character result card

```text
surface: {color.surface.character}
radius: 32pt
padding: 24pt
character-art: 240–280pt
name: {type.display.md}
comment: {type.body.lg}
primary-action: "일기로 이어가기"
secondary-action: "오늘은 여기까지"
```

순서는 `캐릭터 → 이름 → 따뜻한 코멘트 → 선택형 질문 또는 행동`으로 고정한다.

### 13.3 Core library · confirmed six

| Node | Internal type | Internal branch | Intervention focus | User-facing character |
|---|---|---|---|---|
| Node 4 | 평시관리형 | 외로움 ≤ 5, 가정 스트레스 ≤ 2 | 평시 관리 | 볕 모으는 조약돌 |
| Node 9 | 가족압박형 | 외로움 ≤ 5, 가정 스트레스 > 2, 학력 ≤ 1 | 가정 스트레스 | 눌린 구름쿠션 |
| Node 10 | 가족부담형 | 외로움 ≤ 5, 가정 스트레스 > 2, 학력 > 1 | 가정 스트레스 | 물 머금은 화분 |
| Node 12 | 고립중심형 | 외로움 > 5, 신체화 ≤ 3 | 외로움 | 신호 찾는 라디오 |
| Node 14 | 고립-신체긴장형 | 외로움 > 5, 신체화 > 3, 역기능적 대처 ≤ 15 | 신체화 + 외로움 | 팽팽한 풍선 |
| Node 15 | 복합대처형 | 외로움 > 5, 신체화 > 3, 역기능적 대처 > 15 | 대처 + 신체화 + 외로움 | 엉킨 이어폰 |

- 위 표의 분기와 말단값은 내부 분석 참고용이다. 사용자에게는 마지막 열의 캐릭터 이름과 검토된 코멘트만 보인다.
- 이 분류는 성인 한·일 코로나 자료와 `2주간 자살사고` 결과를 사용한 참고 모델이며 14–19세 청소년에게 검증된 진단·위험 예측 모델이 아니다.
- 성인 말단 비율 `17% / 88% / 56% / 30% / 48% / 86%`는 개인 위험 확률도, 캐릭터의 감정 강도도 아니다.
- 젖은 성냥 등 비핵심 캐릭터는 확장 참고안으로 보관하고 MVP 에셋·결과에는 포함하지 않는다.

### 13.4 Comment grammar

1. 캐릭터 사물과 연결된 은유는 첫 문장에 한 번만 사용한다.
2. 두 번째 문장은 사용자의 잘못이 아니라는 점이나 지금 다 해결하지 않아도 된다는 점을 직접 말한다.
3. 질문에는 비유를 쓰지 않고 실제 말·상황·몸의 위치·행동을 묻는다.
4. 한 번에 한 가지를 물으며 답하지 않을 선택을 제공한다.

| Character | Approved default comment | Concrete follow-up question |
|---|---|---|
| 볕 모으는 조약돌 | 오늘은 마음에 볕이 조금 머문 하루였구나. 괜찮았던 순간 하나만 기억해두자. | 오늘 가장 편안하거나 기분 좋았던 순간은 언제였어? |
| 눌린 구름쿠션 | 집에서 받은 말이나 분위기가 마음을 꾹 눌렀구나. 네가 예민해서 힘든 건 아니야. | 오늘 집에서 가장 마음을 무겁게 만든 말이나 상황은 뭐였어? |
| 물 머금은 화분 | 가족 걱정과 해야 할 일을 너무 많이 머금고 있었구나. 오늘 다 해결하지 않아도 돼. | 가족과 관련해 지금 가장 부담되는 일 한 가지는 뭐야? |
| 신호 찾는 라디오 | 누군가와 연결되고 싶은데 내 마음이 잘 닿지 않았구나. 지금 혼자인 느낌이 들어도 네 마음이 사라진 건 아니야. | 오늘 혼자라고 가장 크게 느낀 순간은 언제였어? |
| 팽팽한 풍선 | 참고 있던 긴장이 몸까지 팽팽하게 만들었구나. 먼저 어깨와 턱의 힘을 조금 빼도 괜찮아. | 지금 머리·가슴·배·어깨 중 가장 불편한 곳은 어디야? |
| 엉킨 이어폰 | 여러 감정과 생각이 한꺼번에 엉켜서 막막했구나. 지금은 하나만 골라 풀어도 충분해. | 오늘 마음이 힘들 때 가장 먼저 한 행동은 뭐였어? |

톤의 기준은 `젖은 성냥: 불붙고 싶은데 축축한 하루였구나. 괜찮아, 마르면 다시 켜져.` 정도다. 은유를 반복하거나 질문까지 비유로 만들지 않는다.

### 13.5 Implementation data boundary

```json
{
  "classificationModelVersion": "adult-ctree-reference-1",
  "emaTypeId": "isolation_somatic_tension",
  "coreCharacterId": "tense_balloon",
  "safetyGate": "pass",
  "selectedEmotionIds": ["anxious"],
  "taxonomyVersion": "emotion-ko-1.0"
}
```

- `safetyGate`를 먼저 평가하고 `pass`일 때만 `emaTypeId`를 산출한다.
- `coreCharacterId`는 `CHARACTER_BY_EMA_TYPE[emaTypeId]`의 1:1 매핑 결과만 사용한다.
- `selectedEmotionIds`는 감정 라벨과 일기 질문 템플릿에만 전달하며 `emaTypeId`나 `coreCharacterId` 계산에 전달하지 않는다.
- 일반 제품 분석에는 일기 원문, 위험 관련 원점수, 내부 분기 답변을 보내지 않는다.
- 위험 관련 이벤트·보관·접근 권한은 임상·법률·개인정보 정책으로 별도 정의한다.
- 화면 UI와 접근성 라벨에는 `coreCharacterId`에 대응하는 사용자용 한국어 이름만 사용한다.

## 14. Product screen patterns

### 14.1 Required screen families

| Screen family | Required screens | Primary purpose |
|---|---|---|
| 온보딩 | Splash · Welcome · 로그인 · 계정 생성 · 동의 · Baseline · 안전계획 · 알림 | 신뢰와 선택권을 확보한 뒤 첫 세션으로 연결 |
| 데일리세션 | 감정카드 · EMA · 안전 분기 · 유형 캐릭터 · 질문 선택 · 일기 · AI 코멘트 | 오늘의 상태를 구체적인 언어와 기록으로 전환 |
| 기록변화 | 월 선택 · 날짜 선택 · EMA · EMI · Baseline · 기록 상세 | 과거 기록을 평가가 아닌 흐름으로 회고 |
| 기타 | 피드백 · 알림 · 앱 잠금 · 안전계획 · 전체 삭제 · 로그아웃 | 설정과 데이터 통제권 제공 |
| 안전레이어 | SOS 홈 · 위기 레이어 · 나의 안전계획 · 외부 연결 | 위기 순간에 즉시 가능한 안전 행동 제공 |

### 14.2 Onboarding and account

권장 순서는 다음과 같다.

1. Splash: 브랜드명만 짧게 노출하고 자동으로 다음 단계로 이동한다.
2. Welcome: `30초 EMA`, `짧은 감정 일기`, `AI 코멘트`, `나의 기록 그래프`의 역할과 앱의 한계를 함께 설명한다.
3. 로그인 또는 시작하기: 기존 계정과 신규 사용자의 경로를 분리한다.
4. 계정 생성: 이메일·비밀번호·최소 프로필을 단계별로 받고 진행률을 표시한다.
5. 동의: 서비스 이용, 개인정보, 민감정보, AI 데이터 처리, 선택 마케팅을 각각 구분한다.
6. Baseline: 초기 상태를 측정하되 건강 점수나 진단처럼 표현하지 않는다.
7. 안전계획: 위험 신호·스스로 돕는 방법·연락할 사람을 작성하거나 나중에 설정할 수 있게 한다.
8. 알림: 저녁 알림 등 목적과 잠금화면 노출 예시를 보여준 뒤 명시적으로 opt-in 받는다.

- 서비스가 할 수 있는 것과 할 수 없는 것, 감정 기록이 민감정보라는 점을 첫 세션 전에 설명한다.
- 필수 동의와 선택 동의를 시각적으로 분리하고 이미 선택된 체크박스를 기본값으로 두지 않는다.
- 계정 오류·중복 이메일·네트워크 실패·동의 철회·알림 권한 거부 상태를 설계한다.
- 첨부 시안의 임시 서비스명과 임시 동의 문구는 사용하지 않는다.

### 14.3 Home

1. 날짜·짧은 인사
2. 오늘의 세션 Hero card
3. 최근 기록 1개
4. Bottom navigation

- 연속 기록 실패·미달 메시지를 표시하지 않는다.
- 복귀 사용자는 `다시 왔네`처럼 돌아온 행동을 인정한다.

### 14.4 Daily Session

```text
session intro
→ emotion card selection
→ EMA questions
→ safety gate + one EMA result type
→ character mapped 1:1 from EMA type
→ concrete prompt selection
→ optional concept explanation
→ guided or free journal
→ restrained AI comment
→ save and close
```

1. 감정카드는 확정된 `emotion-ko-1.0`의 7개 대분류·35개 소분류만 사용한다.
2. 감정카드 선택 시기와 관계없이 `selectedEmotionIds`를 EMA 유형 계산 함수에 전달하지 않는다.
3. EMA 완료 시 `safetyGate`를 먼저 평가하고, 통과한 경우에만 `emaTypeId`를 산출한다.
4. 캐릭터 화면은 `CHARACTER_BY_EMA_TYPE[emaTypeId]` 결과를 그대로 사용한다.
5. 선택 감정어는 유형별 기본 질문을 실제 말·상황·몸의 위치·행동에 맞게 구체화하는 데만 사용한다.
6. 질문은 2–3개 후보 중 하나를 고르거나 건너뛸 수 있으며, 자유 입력 시작점을 함께 제공한다.
7. 심리 개념 설명은 Bottom Sheet로 짧게 제공하고 사용자의 상태를 개념으로 단정하지 않는다.
8. AI 코멘트는 기록을 요약·반영하되 원인 진단, 미래 예측, 치료 지시를 하지 않는다.
9. 중단·오프라인·저장 실패 시 임시 저장하고 세션 재개 여부를 사용자가 선택한다.

첨부된 데일리세션 시안의 `젖은 성냥`, 과거 유형명, 임시 감정 목록은 구조 참고용이다. 실제 구현에서는 핵심 6종, 확정 유형 ID, `emotion-ko-1.0`으로 교체한다.

### 14.5 Records and Change

상단 구조는 `월 선택 → 날짜 선택 → EMA / EMI / Baseline 탭`으로 한다.

| Tab | Content | Display rule |
|---|---|---|
| EMA | 기간별 기분·버거움·연결감과 EMA 유형 | 축·단위·기간을 표시하고 색 외에 범례·수치·텍스트 제공 |
| EMI | 선택 감정어, 적용된 질문·개입, 사용자의 응답, AI 코멘트 | 원문은 사용자가 명시적으로 열었을 때만 표시 |
| Baseline | 초기 측정과 재측정의 변화 | 건강 점수·등급 대신 기준일과 변화 방향을 설명 |

- 날짜·감정어·캐릭터 이름을 함께 표시하되 캐릭터 빈도나 점수를 성과처럼 만들지 않는다.
- 데이터가 부족하면 빈 그래프를 그리지 않고 `아직 비교할 기록이 부족해`와 필요한 기록 수를 설명한다.
- 서로 다른 척도를 한 축에 합치거나 임의의 종합 점수를 만들지 않는다.
- 그래프의 모든 점과 막대에 스크린리더용 날짜·값·라벨을 제공한다.
- 기록 삭제·내보내기·보관 정책을 쉽게 찾을 수 있게 한다.

### 14.6 Feedback and Settings

#### Feedback bottom sheet

- 1–5점 선택과 선택형 자유 의견을 제공한다.
- 의견란은 선택이며 빈 상태로도 제출할 수 있다.
- 전송 중·완료·실패·다시 시도 상태를 제공하고 기록 원문이나 위험 값을 자동 첨부하지 않는다.

#### Settings

- 알림 시간 및 잠금화면 문구 미리보기
- 앱 잠금과 생체 인증 실패 대안
- 나의 안전계획 보기·편집
- 기록 전체 삭제와 계정·데이터 처리 범위 안내
- 로그아웃

전체 삭제는 영향 범위를 설명한 별도 확인 화면과 재인증을 거친다. 로그아웃과 삭제는 같은 색·위계로 보이지 않게 구분한다.

### 14.7 Safety Layer

안전레이어는 일반 화면 위에 덧씌우는 장식 모달이 아니라 별도 정보 구조다.

1. SOS Home: `마음 가라앉히기`, `나의 안전계획`, `지금 이야기하고 싶어`를 첫 화면에 제공한다.
2. Crisis Layer: 캐릭터 없이 상태를 인정하고 `지금 통화하기 · 109`, `청소년상담 1388`, `나의 안전계획 열기`, 이탈 행동을 제공한다.
3. Safety Plan: 위험 신호 알아차리기, 나를 진정시키기, 연락할 사람·기관을 순서대로 표시하고 편집을 제공한다.

- 자동 전화 연결이나 연락처 전송은 사용자 확인 없이 실행하지 않는다.
- 안전계획의 연락처는 일반 분석 이벤트와 알림 본문에 포함하지 않는다.
- 연결 실패·전화 불가·해외 지역·연락처 미설정 상태를 설계한다.
- 세부 색상·문장·행동 위계는 `17. Safety Quiet Mode`를 따른다.

### 14.8 Shared states and data

모든 화면군에 `loading`, `empty`, `partial`, `offline`, `save-failed`, `permission-denied`, `locked`, `deleted` 상태를 정의한다.

```json
{
  "sessionId": "session_uuid",
  "emaTypeId": "family_pressure",
  "coreCharacterId": "pressed_cloud_cushion",
  "selectedEmotionIds": ["frustrated", "disappointed"],
  "promptId": "family_hardest_words",
  "journalEntryId": "entry_uuid",
  "safetyGate": "pass"
}
```

- `emaTypeId`와 `coreCharacterId`는 세션 결과로 함께 저장해 기록 화면에서 재계산하지 않는다.
- 감정어·질문·코멘트는 각각 taxonomy/content version을 함께 저장한다.
- 민감한 원문과 연락처는 최소 권한 저장소에 분리하고 일반 제품 분석에는 식별 불가능한 상태 이벤트만 전달한다.

## 15. Responsive and adaptive behavior

| Range | Width | Behavior |
|---|---:|---|
| Compact | 320–359pt | 좌우 16pt, 장식 축소, 긴 제목 줄바꿈 |
| Standard | 360–399pt | 기준 구성, 좌우 20pt |
| Large mobile | 400–479pt | 좌우 24pt, 카드 최대 폭 430pt |
| Tablet | 600pt+ | v1 후속 범위, 콘텐츠 중앙 정렬 |

- 화면 높이가 짧으면 장식보다 질문·입력·행동을 우선한다.
- 가로모드에서도 안전 행동과 입력 내용을 잃지 않는다.
- Bottom navigation 라벨을 숨기지 않는다.
- 캐릭터 이미지는 컨테이너 폭의 최대 72%로 제한한다.

## 16. Accessibility

### 16.1 Contrast

- 일반 텍스트: 최소 4.5:1
- 큰 텍스트: 최소 3:1
- 아이콘·포커스·컨트롤 경계: 최소 3:1
- `{color.primitive.muted}`, coral, pink, sky는 일반 본문색으로 사용하지 않는다.
- 파스텔 버튼 위에는 흰색 대신 `{color.text.on-accent}`를 사용한다.

### 16.2 Touch and input

- 제품 기준 최소 터치 영역: 44 × 44pt
- 주요 버튼 높이: 52pt
- 작은 시각 요소도 주변 hit area를 확장한다.
- 드래그가 필요한 조작에는 탭 대안을 제공한다.

### 16.3 Assistive technology

- 모든 아이콘 버튼에 목적이 드러나는 접근성 이름을 제공한다.
- 선택점에는 `3/5, 보통`처럼 값·범위·선택 상태를 제공한다.
- 캐릭터 이미지의 대체 텍스트는 외형보다 정서적 의미를 간단히 설명한다.
- 읽기 순서는 시각적 순서와 일치해야 한다.
- 글자 확대 시 버튼·표·카드 높이를 고정하지 않는다.

### 16.4 Motion and sensory safety

- Reduce Motion을 존중한다.
- 소리는 기본 사용하지 않는다.
- 햅틱은 선택 피드백에만 제한하고 끌 수 있어야 한다.
- 빠른 점멸·강한 진동·자동 반복 모션을 사용하지 않는다.

## 17. Safety Quiet Mode

Safety Quiet Mode는 위험 신호가 감지되거나 사용자가 직접 SOS에 진입할 때 적용되는 별도 표현 체계다.

### 17.1 Quiet palette

| Token | Value | Use |
|---|---:|---|
| `{color.quiet.canvas}` | `#EFF0F5` | 안전 화면 배경 |
| `{color.quiet.primary}` | `#565D8A` | 주요 행동·제목 |
| `{color.quiet.secondary}` | `#6E76A8` | 큰 텍스트·아이콘 |
| `{color.quiet.ink}` | `#39384A` | 본문 |
| `{color.quiet.muted}` | `#7B7C93` | 큰 보조 텍스트, 작은 본문에는 사용 금지 |

### 17.2 Override rules

- coral·pink gradient와 모든 감정 캐릭터를 제거한다.
- 축하·연속 기록·점수·배지·게임성을 제거한다.
- Jua, bounce, glow, 강한 shadow를 사용하지 않는다.
- 문장 순서는 `감정 인정 → 혼자가 아님 → 즉시 행동 → 다른 선택 → 이탈 선택`이다.
- 전화·안전 계획 행동을 첫 시선 안에 배치한다.
- 빨간색·느낌표·경고음·강제 모달을 사용하지 않는다.
- 화면을 닫거나 기존 기록으로 돌아갈 수 있는 명확한 행동을 제공한다.

### 17.3 Action hierarchy

1. Primary: `지금 통화하기 · 109`
2. Secondary: `청소년상담 1388 연결하기`
3. Secondary: `나의 안전 계획 열기`
4. Exit: `지금은 괜찮아, 하던 걸 계속할래`

- 자살예방상담전화 109와 청소년상담 1388 정보는 배포 전마다 운영 주체의 공식 정보로 재검증한다.
- 앱은 응급 서비스가 아니며 위기 탐지·노출 문구·연결 순서는 임상·법률 검토를 우선한다.
- 연결 실패 시 다시 시도, 다른 상담 경로, 기기 전화 앱 열기를 제공한다.

## 18. Voice and UI copy

| Context | Tone | Example |
|---|---|---|
| 일상 체크인 | 짧고 다정한 반말 | 오늘 어때? |
| 일기 유도 | 선택권이 보이는 반말 | 짧아도 괜찮아. 적고 싶은 만큼만 남겨줘. |
| 캐릭터 | 가벼운 은유 + 직접 안심 | 여러 감정과 생각이 한꺼번에 엉켜서 막막했구나. 지금은 하나만 골라 풀어도 충분해. |
| 복귀 | 연속성보다 돌아옴 인정 | 다시 왔네. 지난 이야기는 적어도 되고, 안 적어도 돼. |
| 동의·개인정보 | 간결한 해요체 | 감정 기록은 민감정보로 안전하게 보호해요. |
| 위기 | 짧고 직접적인 차분한 문장 | 혼자 견디지 않아도 돼. 지금 할 수 있는 걸 같이 해보자. |

### Prohibited copy

- 진단: `우울증 같아`, `너는 회피형이야`
- 낙관 강요: `긍정적으로 생각해`, `곧 괜찮아질 거야`
- 기록 압박: `연속 기록에 실패했어`
- 감정 축소: `고작`, `별일 아니야`, `그 정도로`
- 죄책감 유발: `가족을 생각해`, `그러면 안 돼`

## 19. Do and don't

### Do

- Mist Canvas와 흰색이 화면 대부분을 차지하게 한다.
- 한 화면에 질문 하나·Primary action 하나를 둔다.
- 캐릭터마다 같은 재질·얼굴·비율·그림자 규칙을 적용한다.
- 감정을 색·라벨·문장으로 함께 표현한다.
- 캐릭터 끄기·질문 건너뛰기·직접 수정을 제공한다.
- 위기 신호에서는 즉시 Quiet Mode로 전환한다.

### Don't

- 모든 카드에 다른 그라데이션을 사용하지 않는다.
- 캐릭터·텍스트·배지를 동시에 강조하지 않는다.
- 캐릭터마다 다른 화풍과 세계관을 적용하지 않는다.
- 사용자의 감정을 하나의 캐릭터로 단정하지 않는다.
- 위기 신호를 귀여운 결과 화면으로 포장하지 않는다.
- 친근함을 이유로 진단·훈계·낙관 강요를 하지 않는다.

## 20. QA checklist

### Visual

- [ ] 화면 면적 70/20/10 비율이 유지되는가?
- [ ] 한 화면에 Primary action이 하나인가?
- [ ] 임의 hex·간격·radius가 없는가?
- [ ] 제목과 버튼 라벨이 예상치 못하게 잘리지 않는가?
- [ ] 캐릭터의 크기·눈 위치·그림자가 일관적인가?

### Interaction

- [ ] 모든 컴포넌트에 pressed·disabled·loading·error 상태가 있는가?
- [ ] 뒤로가기·닫기·건너뛰기가 예측 가능한가?
- [ ] 키보드가 입력과 주 행동을 가리지 않는가?
- [ ] 네트워크 오류와 임시 저장 상태가 설명되는가?
- [ ] 감정카드를 바꾸어도 저장된 `emaTypeId`와 `coreCharacterId`가 바뀌지 않는가?
- [ ] 후속 질문은 비유 대신 실제 말·상황·몸의 위치·행동 중 한 가지를 묻는가?
- [ ] 모든 전체화면 로딩이 동일한 로고·문구·페이드 규칙을 사용하는가?
- [ ] 제한 시간을 넘긴 로딩이 오류·재시도 상태로 전환되는가?

### Accessibility

- [ ] 일반 텍스트 대비가 4.5:1 이상인가?
- [ ] 모든 터치 영역이 44 × 44pt 이상인가?
- [ ] 색 이외의 상태 표현이 있는가?
- [ ] 글자 확대·스크린리더·Reduce Motion을 지원하는가?
- [ ] 로딩 상태가 `불러오는 중`으로 한 번만 안내되고 Reduce Motion에서 정지하는가?
- [ ] EMA 척도를 드래그 없이 조작할 수 있는가?
- [ ] 35개 감정어의 표시 문구와 taxonomy ID가 승인 목록과 일치하는가?
- [ ] 감정 선택 상태가 색 이외의 방식으로도 전달되는가?

### Safety

- [ ] 임상 검토된 안전 분기가 내부 유형·캐릭터 계산보다 먼저 실행되는가?
- [ ] 위험 신호에서 캐릭터·축하·게임성이 제거되는가?
- [ ] 결과 캐릭터가 확정된 핵심 6종과 승인된 매핑 안에서만 선택되는가?
- [ ] `coreCharacterId`가 오직 `emaTypeId`의 1:1 매핑으로 결정되는가?
- [ ] Node·성인 말단 비율·학력·역기능적 대처 용어가 사용자 화면에 노출되지 않는가?
- [ ] 109·1388 연결 정보가 배포 시점에 재검증되었는가?
- [ ] 연결 실패 대안과 이탈 선택이 있는가?
- [ ] 안전 화면 문구가 임상·법률 검토를 통과했는가?
- [ ] 감정 기록과 위험 관련 이벤트가 불필요하게 분석 도구로 전송되지 않는가?

## 21. Known gaps

아래 항목은 디자인만으로 확정할 수 없으며 제품·임상·법률·개발 의사결정이 필요하다.

- 플랫폼 기술 스택과 토큰 내보내기 형식
- Dark Mode·태블릿 지원 범위
- EMA 질문·척도·점수 및 6가지 결과 유형 산출 기준
- 감정어 선택 개수와 유형별 기본 질문을 감정어로 구체화하는 규칙
- EMA·EMI·Baseline의 제품 정의, 집계 단위, 비교 기간, 재측정 주기
- 기록변화 그래프의 축·결측값·데이터 부족 기준과 AI 코멘트 노출 범위
- 성인 분류모델의 청소년 타깃 적용 타당성 및 청소년 자료 기반 재검증
- Node 9·10의 성인 학력 분기를 대체할 청소년 적합 변수
- 위기 신호 탐지·안전 분기·개인정보 처리
- 미성년자 계정 생성·보호자 동의·민감정보·AI 처리 동의의 필수 범위
- 피드백 저장 범위, 앱 잠금 복구, 기록 전체 삭제와 계정 삭제의 관계
- 최종 내비게이션 정보 구조
- 캐릭터 원화·애니메이션 포맷·반복 노출 기준
- 폰트 라이선스와 앱 내 임베딩

세부 결정안과 권장 기본값은 [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)를 따른다.

## 22. References

- 브랜드 기준: `마음곁 젤리팝 브랜드북 v3.4`
- 접근성: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- 자살예방상담전화: [보건복지부 109 안내](https://www.mohw.go.kr/gallery.es?act=view&bid=0003&list_no=380102&mid=a10607030000&tag=)
- 청소년상담: [청소년1388 상담 안내](https://www.1388.go.kr/occ/YTOSP_SC_OCC_01)
