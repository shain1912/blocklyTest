# 🎬 시연용 예제 모음

## 📂 파일 목록

| 파일명 | 설명 | 필요 라이브러리 | 난이도 |
|--------|------|----------------|--------|
| `01_basic_backdrop.py` | 배경 & 스프라이트 변경 기본 | 없음 | ⭐ |
| `02_turtle_graphics.py` | 거북이 그래픽 도형 그리기 | turtle-graphics | ⭐⭐ |
| `03_game_score.py` | 게임 점수 시스템 | game-utils | ⭐⭐ |
| `04_animation_show.py` | 스프라이트 애니메이션 쇼 | sprite-animations | ⭐⭐ |
| `05_space_journey.py` | 종합 예제 (우주 여행) | turtle-graphics | ⭐⭐⭐ |

---

## 🚀 사용 방법

### 방법 1: Python 코드 붙여넣기
1. 예제 파일 열기 (예: `01_basic_backdrop.py`)
2. 전체 코드 복사
3. BlockPy 에디터의 **Python Editor** 탭으로 이동
4. 코드 붙여넣기
5. **▶ Run** 버튼 클릭

### 방법 2: Python → Blockly 변환 (추천!)
1. Python Editor에 코드 붙여넣기
2. **[🔄 Convert]** 버튼 클릭
3. Blockly 블록으로 자동 변환!
4. 블록 확인 후 **▶ Run** 실행

---

## 📚 라이브러리 설치 방법

일부 예제는 라이브러리가 필요합니다.

### 설치 순서:
1. 화면 상단 **[📦 Library]** 버튼 클릭
2. **Install** 탭 선택
3. "Featured Libraries" 섹션에서 원하는 라이브러리 찾기
4. **[Install]** 버튼 클릭
5. 페이지 새로고침 (F5)
6. Blockly toolbox에 새 카테고리 생김!

### 설치 가능한 라이브러리:

#### 🐢 turtle-graphics (v1.1.0)
```
기능: 거북이 그래픽 그리기
블록:
- forward, backward: 전진/후진
- left, right: 회전
- pendown, penup: 펜 올리기/내리기
- color: 펜 색상 변경
- goto: 절대 위치 이동
```

#### 🎮 Animations (v1.0.0)
```
기능: 스프라이트 애니메이션
블록:
- jump: 점프
- shake: 좌우 흔들기
- spin: 회전
- blink: 깜빡임
```

#### 🎮 Game Utils (v1.0.0)
```
기능: 게임 제작 유틸리티
블록:
- game start: 게임 초기화
- set score: 점수 설정
- change score: 점수 변경
- score: 점수 가져오기
- touching sprite: 충돌 감지
- game over: 게임 종료
```

---

## 🎯 시연 시나리오 (5분)

### 1단계: 기본 기능 (1분)
**실행**: `01_basic_backdrop.py`

> "먼저 새로운 배경 전환 기능을 보여드리겠습니다.
> 파란 하늘에서 시작해 우주로 배경이 바뀌고,
> 강아지 스프라이트가 로봇으로 변신합니다."

**강조 포인트**:
- ✅ 4가지 배경 (white, blue-sky, green, space)
- ✅ 6가지 스프라이트 (cat, dog, turtle, robot, ball, arrow)
- ✅ `switch_backdrop`, `switch_costume` 블록

---

### 2단계: 라이브러리 시스템 (1분)
**실행**: Library Manager 시연

> "BlockPy는 pip처럼 동작하는 라이브러리 시스템을 제공합니다.
> 원클릭으로 turtle-graphics를 설치해보겠습니다."

**시연 내용**:
1. 📦 Library 버튼 클릭
2. turtle-graphics 설치
3. 페이지 새로고침
4. 🐢 Turtle 카테고리 생긴 것 확인

---

### 3단계: 거북이 그래픽 (2분)
**실행**: `02_turtle_graphics.py`

> "설치한 라이브러리를 사용해 도형을 그려보겠습니다.
> 빨간 사각형, 파란 팔각형, 노란 별이 그려집니다."

**강조 포인트**:
- ✅ Pen 시스템 (pendown/penup)
- ✅ 색상 변경
- ✅ 반복문으로 도형 그리기

---

### 4단계: 종합 예제 (1분)
**실행**: `05_space_journey.py`

> "마지막으로 모든 기능을 통합한 우주 여행 시나리오입니다.
> 지구에서 출발해 우주에 도착하고, 별을 그립니다."

**강조 포인트**:
- ✅ 배경 + 스프라이트 + 거북이 그래픽 조합
- ✅ Python ↔ Blockly 변환
- ✅ 실시간 Stage 미리보기

---

## 💡 발표 팁

### 사전 준비 체크리스트:
- [ ] `npm run dev` 실행하여 서버 켜기
- [ ] 모든 라이브러리 미리 설치
- [ ] 예제 파일 순서대로 브라우저 탭에 열어두기
- [ ] Stage가 잘 보이도록 창 크기 조절

### 실수 대처:
- **블록이 안 보임**: F5로 새로고침
- **라이브러리 에러**: Library Manager에서 재설치
- **Stage 안 움직임**: Run 버튼 다시 클릭
- **변환 실패**: Python 문법 확인 (들여쓰기, 콜론 등)

### 추가 시연 아이디어:
1. **Python 코드 작성 → Block 변환** 시연
2. **Block 드래그 → Python 실시간 생성** 시연
3. **Library Export** 기능 시연 (직접 만든 함수를 라이브러리로)

---

## 🐛 문제 해결

### Q: 라이브러리 설치했는데 블록이 안 보여요
A: F5로 페이지를 새로고침 하세요.

### Q: 스프라이트가 안 바뀌어요
A: `switch_costume("dog")` 철자 확인. 소문자여야 함.

### Q: 배경 이름이 뭔가요?
A: white, blue-sky, green, space (정확히 입력)

### Q: 거북이 그래픽 블록이 없어요
A: Library Manager에서 turtle-graphics를 설치했는지 확인

### Q: game_over()가 에러 나요
A: game-utils 라이브러리 설치 필요

---

## 📞 문의

예제 추가 요청이나 버그 리포트는 GitHub Issues로 등록해주세요.

Happy Coding! 🎉
