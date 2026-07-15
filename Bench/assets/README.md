# 마음곁 젤리팝 개발용 PNG 에셋

> Source: `마음곁_젤리팝_브랜드북_v3.3.docx` · Export v1 · 2026-07-15

## 사용 원칙

- `01_logo`: 실제 앱·웹에 사용할 로고 마스터다. 앱 아이콘 제출본은 `logo_app_icon_master_1024.png`를 사용한다.
- `02_characters/transparent_1024`: 확정된 핵심 캐릭터 6종의 투명 PNG다. 카드 배경·이름·코멘트는 앱 UI로 구현한다.
- `03_mockups`: 구현 참고용 시안이며 완성된 화면 이미지 자체를 앱에 삽입하지 않는다.
- `04_brandbook_images`: 최종 브랜드북에 삽입된 설명용 보드와 참고 이미지다.
- Node·내부 유형·성인 자료의 말단 비율은 사용자 화면이나 파일 표시명에 노출하지 않는다.
- 모든 캐릭터는 1024×1024 투명 마스터이며 비율을 유지해 축소한다. 임의로 늘이거나 색상을 바꾸지 않는다.

## 에셋 목록

| 파일 | 구분 | 크기 | 투명 | 설명 |
|---|---|---:|:---:|---|
| `01_logo/logo_app_icon_master_1024.png` | logo | 1024×1024 | 아니오 | 앱스토어·런처용 1024px 정사각형 마스터. 외곽 투명도 없음 |
| `01_logo/logo_app_icon_preview_1024.png` | logo | 1024×1024 | 예 | 브랜드북처럼 둥근 타일 외곽이 투명한 프리뷰 |
| `01_logo/logo_symbol_color_1024.png` | logo | 1024×1024 | 예 | 밝은 배경용 컬러 심볼, 투명 배경 |
| `01_logo/logo_symbol_light_1024.png` | logo | 1024×1024 | 예 | 어두운 배경용 흰색·코랄 심볼, 투명 배경 |
| `01_logo/logo_wordmark_horizontal_2048.png` | logo | 2048×720 | 예 | 컬러 심볼과 마음곁 워드마크의 가로 조합, 투명 배경 |
| `02_characters/transparent_1024/character_sun_pebble_1024.png` | character | 1024×1024 | 예 | 볕 모으는 조약돌 기본형. 카드 배경과 문구를 포함하지 않는 투명 PNG |
| `02_characters/transparent_1024/character_cloud_cushion_1024.png` | character | 1024×1024 | 예 | 눌린 구름쿠션 기본형. 카드 배경과 문구를 포함하지 않는 투명 PNG |
| `02_characters/transparent_1024/character_water_pot_1024.png` | character | 1024×1024 | 예 | 물 머금은 화분 기본형. 카드 배경과 문구를 포함하지 않는 투명 PNG |
| `02_characters/transparent_1024/character_radio_1024.png` | character | 1024×1024 | 예 | 신호 찾는 라디오 기본형. 카드 배경과 문구를 포함하지 않는 투명 PNG |
| `02_characters/transparent_1024/character_tense_balloon_1024.png` | character | 1024×1024 | 예 | 팽팽한 풍선 기본형. 카드 배경과 문구를 포함하지 않는 투명 PNG |
| `02_characters/transparent_1024/character_tangled_earphones_1024.png` | character | 1024×1024 | 예 | 엉킨 이어폰 기본형. 카드 배경과 문구를 포함하지 않는 투명 PNG |
| `04_brandbook_images/brand_cover_visual.png` | brandbook-image | 1600×780 | 아니오 | 브랜드북 표지 젤리팝 비주얼 |
| `04_brandbook_images/persona_reference.png` | brandbook-image | 900×1080 | 아니오 | 가상 페르소나 참고 이미지 |
| `03_mockups/jellypop_ui_mockup_3screens.png` | brandbook-image | 1020×716 | 아니오 | 홈·EMA·캐릭터 결과 3화면 시안 |
| `04_brandbook_images/logo_mascot_identity_board.png` | brandbook-image | 1600×600 | 아니오 | 로고·워드마크·마스코트 운용 보드 |
| `04_brandbook_images/ema_character_system_board.png` | brandbook-image | 1600×560 | 아니오 | EMA에서 감정 캐릭터로 이어지는 구조 보드 |
| `04_brandbook_images/core_character_six_board.png` | brandbook-image | 1600×420 | 아니오 | 확정된 핵심 캐릭터 6종 보드 |

## 개발 전달 메모

- iOS Asset Catalog와 Android 리소스에는 투명 캐릭터 마스터를 넣고 플랫폼 빌드 과정에서 필요한 배율을 생성한다.
- 접근성 이름은 사용자용 한국어 캐릭터명을 사용한다. 예: `신호 찾는 라디오`.
- Safety Quiet Mode에서는 캐릭터 PNG를 로드하거나 노출하지 않는다.
- PNG 최적화나 WebP 변환은 원본 마스터를 보존한 복사본에서 진행한다.
