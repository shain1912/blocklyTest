# BlockPy 테스트 시나리오

> `npm run dev` 실행 후 브라우저에서 직접 수행

---

## 0. 환경 준비

- [ ] `npm run dev` 실행, 브라우저에서 `http://localhost:5173` 접속
- [ ] 콘솔(F12 → Console) 열어두기 — 에러 실시간 확인
- [ ] 시작 전 localStorage 초기화 옵션: 콘솔에 `localStorage.clear(); location.reload()` 입력

---

## 1. 기본 UI 레이아웃

| # | 확인 항목 | 기대 결과 | 결과 |
|---|---|---|---|
| 1-1 | 앱 전체 레이아웃 | 좌측 파일 탐색기 / 중앙 에디터 / 우측 Stage+Output | |
| 1-2 | Blocks / Python 토글 버튼 | 각 클릭 시 해당 뷰로 전환 | |
| 1-3 | ✨ AI 버튼 클릭 | 에디터 우측에 AI 패널 슬라이드 표시 | |
| 1-4 | 📦 Libs 버튼 클릭 | 에디터 우측에 라이브러리 매니저 패널 표시 | |
| 1-5 | AI + Libs 동시 열기 | 두 패널 모두 동시에 표시 가능한지 | |
| 1-6 | 툴박스 카테고리 목록 | Motion, Looks, Sound, Events, Loops, Logic, Math, Text, Variables, Lists, My Blocks, Comments, Library, 🏛 Classes 표시 | |

---

## 2. 블록 기본 동작

| # | 확인 항목 | 기대 결과 | 결과 |
|---|---|---|---|
| 2-1 | Motion → `move 10 steps` 드래그 | 워크스페이스에 블록 배치됨 | |
| 2-2 | Loops → `repeat 10` + `move` 블록 조합 | 두 블록 연결됨 | |
| 2-3 | Undo (↩ 버튼) | 마지막 블록 배치 취소 | |
| 2-4 | Redo (↪ 버튼) | 취소 복원 | |
| 2-5 | 🗑 Clear 버튼 | 워크스페이스 전체 비워짐 | |
| 2-6 | 블록 우클릭 컨텍스트 메뉴 | Duplicate / Delete 등 Blockly 기본 메뉴 표시 | |
| 2-7 | 줌 인/아웃 (마우스 휠 or 버튼) | 워크스페이스 확대/축소 | |

---

## 3. 코드 실행

| # | 테스트 블록 구성 | 기대 결과 | 결과 |
|---|---|---|---|
| 3-1 | `say "Hello BlockPy"` 블록 1개 → ▶ Run | Stage 스프라이트 말풍선 "Hello BlockPy" | |
| 3-2 | `move 100 steps` → ▶ Run | 스프라이트 우측으로 이동 | |
| 3-3 | `repeat 4` 안에 `turn right 90°` + `move 80` | 스프라이트 정사각형 그리기 | |
| 3-4 | `wait 1 seconds` → `say "Done"` | 1초 후 말풍선 표시 | |
| 3-5 | `set x = 0`, `forever` 안에 `move 5` + `if on edge bounce` | 스프라이트 좌우 왕복 | |
| 3-6 | Reset 버튼 | 스프라이트 중앙 복귀, Output 초기화 | |

---

## 4. Blocks → Python 변환 (단방향)

| # | 블록 구성 | 기대 Python 출력 | 결과 |
|---|---|---|---|
| 4-1 | `say "Hi"` | `print("Hi")` | |
| 4-2 | `move 50 steps` | `sprite.move(50)` | |
| 4-3 | `repeat 5` → `turn right 15°` | `for i in range(5):\n  sprite.turn(15)` | |
| 4-4 | `if true` → `say "yes"` | `if true:\n  print("yes")` | |
| 4-5 | `if_else` 블록 | `if ...\n  ...\nelse:\n  ...` | |
| 4-6 | `set x to 10` | `x = 10` | |
| 4-7 | `wait 2 seconds` | `import time` + `time.sleep(2)` | |
| 4-8 | `forever` 루프 | `while True:\n  ...` | |

---

## 5. Python → Blocks 역변환 (핵심 기능)

> Python 탭에서 코드 직접 수정 후 Blocks 탭으로 돌아올 때

| # | Python 입력 | 기대 블록 | 결과 |
|---|---|---|---|
| 5-1 | `sprite.move(100)` | `move 100 steps` 블록 1개 | |
| 5-2 | `sprite.turn(90)` | `turn right 90°` 블록 | |
| 5-3 | `for i in range(5):\n  sprite.move(10)` | `repeat 5` + 내부 `move 10` | |
| 5-4 | `while True:\n  sprite.move(5)` | `forever` + 내부 `move 5` | |
| 5-5 | `if x > 0:\n  sprite.say("pos")` | `if x > 0` + 내부 `say` | |
| 5-6 | `x = 42` | `set x to 42` 블록 | |
| 5-7 | `import time\ntime.sleep(2)` | `import time` + `wait 2` 블록 | |
| 5-8 | `print("hello")` | `say "hello"` 블록 | |

---

## 6. 양방향 라운드트립 (가장 중요한 버그 체크)

> **Blocks → Python → Blocks → Python** 사이클에서 코드가 보존되는지 확인

| # | 시나리오 | 기대 결과 | 결과 |
|---|---|---|---|
| 6-1 | `repeat 3` + `move 50` 블록 구성 → Python 탭 → Blocks 탭 → Python 탭 | 처음과 동일한 Python 코드 | |
| 6-2 | `if / else` 블록 → 사이클 | 주석 블록(#)으로 바뀌지 않음 | |
| 6-3 | `say "Hello"` 블록 → 사이클 | `print("Hello")` 유지 | |
| 6-4 | `forever` + `move` + `if on edge bounce` → 사이클 | 구조 보존 | |
| 6-5 | Python 탭에서 코드 직접 수정 → ▶ Run | 수정된 코드 기반으로 실행 (동기화 후 실행) | |

---

## 7. 클래스 블록 (OOP 문법)

| # | 확인 항목 | 기대 결과 | 결과 |
|---|---|---|---|
| 7-1 | 툴박스 🏛 Classes 카테고리 존재 | class_define, class_constructor 등 블록 표시 | |
| 7-2 | `class_define` 블록 배치, NAME="Animal" | 워크스페이스에 파란 클래스 블록 | |
| 7-3 | `class_constructor` 블록을 class_define 내부에 연결 | ARGS 필드 있는 __init__ 블록 | |
| 7-4 | `class_method` 블록 연결, NAME="speak" | def speak(self) → None 블록 | |
| 7-5 | Python 탭 전환 | `class Animal:\n  def __init__(self):\n    pass\n  def speak(self) -> None:\n    pass` | |
| 7-6 | Python → Blocks 역변환 | `class Animal:` → `class_define` 블록으로 복원 | |
| 7-7 | `class_instance` 블록: `cat = Animal()` | Python: `cat = Animal()` | |
| 7-8 | `class_method_call` 블록: `cat.speak()` | Python: `cat.speak()` | |
| 7-9 | `class_property_set`: `self.name = "Tom"` | Python: `self.name = "Tom"` | |
| 7-10 | 전체 Animal 클래스 → ▶ Run | 에러 없이 실행됨 | |

---

## 8. 라이브러리 설치 — Turtle Graphics

| # | 확인 항목 | 기대 결과 | 결과 |
|---|---|---|---|
| 8-1 | 📦 Libs → Install 탭 → "turtle-graphics" Install 버튼 | "✅ installed!" 메시지 | |
| 8-2 | 툴박스 즉시 갱신 (페이지 리로드 없이) | 🐢 Turtle 카테고리 출현 | |
| 8-3 | `turtle_pendown` → `turtle_forward 100` → `turtle_right 90` → 4번 반복 | ▶ Run 시 Stage에 정사각형 그려짐 | |
| 8-4 | `turtle_color "blue"` → `turtle_forward 150` | 파란 선 그려짐 | |
| 8-5 | `turtle_clear` 블록 | 캔버스 drawing 초기화 | |
| 8-6 | Reset 버튼 | 스프라이트 복귀 + 그림 초기화 | |
| 8-7 | Python 탭 → `turtle.forward(100)` 확인 | `t.forward(100)` 아닌 `turtle.forward(100)` | |
| 8-8 | Python → Blocks 역변환 | `turtle.forward(100)` → `turtle_forward` 블록 (class_method_call 아님!) | |

---

## 9. 라이브러리 설치 — Sprite Animations

| # | 확인 항목 | 기대 결과 | 결과 |
|---|---|---|---|
| 9-1 | 📦 Libs → Install → "sprite-animations" Install | 설치 성공 | |
| 9-2 | 툴박스에 🎮 Animations 카테고리 출현 | anim_jump, anim_shake, anim_spin, anim_blink | |
| 9-3 | `anim_jump height=80` → ▶ Run | 스프라이트 점프 애니메이션 | |
| 9-4 | `anim_shake times=3` → ▶ Run | 스프라이트 좌우 흔들림 | |
| 9-5 | `anim_spin speed=15` → ▶ Run | 스프라이트 360도 회전 | |
| 9-6 | `anim_blink times=4` → ▶ Run | 스프라이트 깜빡임 | |
| 9-7 | Python 탭 전환 | `# anim_jump height=80` 형태 | |
| 9-8 | Python → Blocks 역변환 | `# anim_jump height=80` → `anim_jump` 블록 복원 | |

---

## 10. 라이브러리 JSON 직접 설치

> Install 탭 → Paste JSON 에 아래 JSON 붙여넣기

```json
{
  "name": "hello-world-lib",
  "version": "1.0.0",
  "description": "테스트용 간단 라이브러리",
  "author": "tester",
  "colour": "#7c3aed",
  "blocks": [
    {
      "type": "hw_greet",
      "colour": "#7c3aed",
      "tooltip": "인사 출력",
      "inputs": [{ "kind": "dummy", "fields": [
        { "type": "label", "label": "greet" },
        { "type": "text_input", "name": "NAME", "default": "World" }
      ]}]
    }
  ],
  "generators": {
    "js": {
      "hw_greet": "const n=block.getFieldValue('NAME'); return `console.log('Hello, ' + ${JSON.stringify(n)} + '!');\\n`;"
    },
    "python": {
      "hw_greet": "const n=block.getFieldValue('NAME'); return `print('Hello, ' + ${JSON.stringify(n)} + '!')\\n`;"
    }
  },
  "toolboxCategory": {
    "kind": "category", "name": "👋 Hello", "colour": "#7c3aed",
    "contents": [{ "kind": "block", "type": "hw_greet" }]
  }
}
```

| # | 확인 항목 | 기대 결과 | 결과 |
|---|---|---|---|
| 10-1 | Paste JSON → Install from JSON | 성공 메시지 | |
| 10-2 | 툴박스에 👋 Hello 카테고리 즉시 출현 | hw_greet 블록 표시 | |
| 10-3 | `greet "BlockPy"` → ▶ Run | Output에 `Hello, BlockPy!` 출력 | |

---

## 11. 라이브러리 관리

| # | 확인 항목 | 기대 결과 | 결과 |
|---|---|---|---|
| 11-1 | 📦 Libs → Installed 탭 | 설치된 라이브러리 카드 목록 표시 | |
| 11-2 | 카드에 이름, 버전, 블록 수 표시 | 올바른 메타데이터 | |
| 11-3 | 🗑 Uninstall 클릭 | 라이브러리 제거됨 | |
| 11-4 | 페이지 리로드 후 재확인 | 설치된 라이브러리 복원됨 (localStorage 유지) | |
| 11-5 | URL 설치 (존재하지 않는 URL) | "Failed to fetch" 에러 표시 | |

---

## 12. 라이브러리 내보내기 (Export)

| # | 확인 항목 | 기대 결과 | 결과 |
|---|---|---|---|
| 12-1 | 워크스페이스에 `class_define` 블록 배치 | - | |
| 12-2 | 📦 Libs → Export 탭 → 이름/버전 입력 → Download | `.blocklib.json` 파일 다운로드 | |
| 12-3 | 다운로드된 JSON 파일 내용 확인 | `name`, `version`, `blocks`, `pythonSource` 포함 | |
| 12-4 | 같은 파일을 Install 탭에 다시 붙여넣기 | 재설치 가능 | |
| 12-5 | 클래스 블록 없는 상태에서 Export | "No class or module blocks found" 에러 | |

---

## 13. AI Agent (Claude API)

> API 키 필요: [Anthropic Console](https://console.anthropic.com) 에서 발급

| # | 확인 항목 | 기대 결과 | 결과 |
|---|---|---|---|
| 13-1 | ✨ AI 버튼 → 패널 열림 | 채팅 UI 표시 | |
| 13-2 | 🔑 버튼 → API 키 입력 → Save | localStorage에 저장됨 | |
| 13-3 | "move sprite forward 10 steps 3 times" 입력 | `repeat 3` + `move_right 10` 블록 로드됨 | |
| 13-4 | "고양이가 정사각형을 그리는 블록 만들어줘" | `repeat 4` + `move` + `turn 90` 구조 생성 | |
| 13-5 | "Animal 클래스 만들어줘, sound 메서드 포함" | `class_define` + `class_method` 블록 생성 | |
| 13-6 | 생성된 블록 → Python 탭 | 유효한 Python 코드 출력 | |
| 13-7 | 생성된 블록 → ▶ Run | 실행 가능 | |
| 13-8 | 잘못된 API 키 입력 | 에러 메시지 표시 (앱 크래시 없음) | |
| 13-9 | "🔄 Load into workspace" 버튼 | 이전 AI 응답 재로드 가능 | |

---

## 14. 파일 시스템

| # | 확인 항목 | 기대 결과 | 결과 |
|---|---|---|---|
| 14-1 | 새 파일 생성 (+ 버튼) | 빈 워크스페이스로 전환 | |
| 14-2 | 파일 더블클릭 → 이름 변경 | 이름 수정 후 Enter 확정 | |
| 14-3 | 파일 전환 | 이전 블록 자동 저장 후 새 파일 로드 | |
| 14-4 | 폴더 생성 → 파일을 폴더 안에 생성 | 계층 구조 표시 | |
| 14-5 | 파일 삭제 | 삭제 후 다른 파일로 자동 전환 | |
| 14-6 | 💾 Save .json → 다운로드 | `.json` 파일 다운로드 | |
| 14-7 | 다운로드 파일 Import | 블록 복원됨 | |
| 14-8 | 페이지 새로고침 | 마지막 작업 상태 복원 (autosave) | |

---

## 15. 회귀 테스트 — 복합 시나리오

### 시나리오 A: Turtle로 별 그리기
```
1. Turtle 라이브러리 설치
2. 블록 구성:
   - turtle_pendown
   - repeat 5:
       - turtle_forward 100
       - turtle_right 144
3. ▶ Run → 별 모양 그려짐 확인
4. Python 탭 → 코드 확인
5. Blocks 탭 → 블록 구조 유지 확인
```

### 시나리오 B: 클래스 + 인스턴스 실행
```
1. 블록 구성:
   - class_define "Counter" (부모 없음)
     - class_constructor (ARGS: "")
       - class_property_set self.count = 0
     - class_method "increment" → None
       - change_variable count by 1
   - class_instance c = Counter()
   - class_method_call c.increment()
   - print c.count
2. Python 탭으로 전환하여 코드 확인
3. ▶ Run
```

### 시나리오 C: AI → 실행 → 수정 → 재실행
```
1. AI에게 "repeat 5번 점프하는 블록" 요청
2. 생성된 블록 확인
3. Python 탭에서 반복 횟수를 10으로 수동 수정
4. Blocks 탭으로 전환 (역변환 확인)
5. ▶ Run
```

---

## 16. 엣지 케이스 / 에러 처리

| # | 시나리오 | 기대 결과 | 결과 |
|---|---|---|---|
| 16-1 | 빈 워크스페이스에서 ▶ Run | "// No code to run" 메시지 | |
| 16-2 | 무한루프 블록 실행 | 브라우저 탭 멈추지 않음 (내부 await로 yield) | |
| 16-3 | Python 탭에서 문법 오류 코드 입력 후 Blocks 전환 | 앱 크래시 없음, 파싱 가능한 블록만 복원 | |
| 16-4 | 잘못된 JSON을 Paste JSON에 입력 | "Error: ..." 메시지, 앱 정상 동작 유지 | |
| 16-5 | 같은 라이브러리 중복 설치 | 기존 버전 덮어쓰기, 에러 없음 | |
| 16-6 | 파일 1개만 남은 상태에서 삭제 | 새 기본 파일 자동 생성 | |
| 16-7 | AI 패널에서 API 키 없이 전송 | 키 입력 폼 표시 | |

---

## 체크리스트 요약

```
[ ] 1. 기본 UI 레이아웃        (6개)
[ ] 2. 블록 기본 동작           (7개)
[ ] 3. 코드 실행                (6개)
[ ] 4. Blocks → Python          (8개)
[ ] 5. Python → Blocks          (8개)
[ ] 6. 양방향 라운드트립        (5개) ← 논문 핵심
[ ] 7. 클래스 블록              (10개) ← 논문 핵심
[ ] 8. Turtle 라이브러리        (8개) ← 논문 핵심
[ ] 9. Sprite Animations        (8개)
[ ] 10. JSON 직접 설치          (3개)
[ ] 11. 라이브러리 관리         (5개)
[ ] 12. 라이브러리 Export       (5개) ← 논문 핵심
[ ] 13. AI Agent                (9개) ← 논문 핵심
[ ] 14. 파일 시스템             (8개)
[ ] 15. 복합 시나리오           (3개)
[ ] 16. 엣지 케이스             (7개)

총 116개 항목
```

---

## 버그 리포트 양식

발견된 버그는 아래 형식으로 기록:

```
## Bug #N
- 재현 경로: (예: 8-8) Turtle 설치 → Python 탭 → Blocks 탭
- 기대 동작: turtle_forward 블록으로 복원
- 실제 동작: class_method_call 블록으로 잘못 복원
- 콘솔 에러: (있으면 복붙)
- 스크린샷: (있으면 첨부)
```
