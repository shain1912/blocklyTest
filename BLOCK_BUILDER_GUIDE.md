# 🏗️ Block Builder 가이드

## **블록 코딩으로 이벤트 블록 만들기!**

이제 **블록을 만드는 블록**으로 자신만의 이벤트 라이브러리를 만들 수 있습니다!

---

## 🎯 목표

**블록 코딩만으로** 다음과 같은 이벤트 블록을 만듭니다:

```
⌨️ when key [space ▼] pressed
    → [이벤트 발생 시 실행할 블록들...]
```

그리고 **Export → Install → 공유!** 🚀

---

## 📦 준비물

1. **Block Builder 카테고리** - 툴박스에서 찾기
   - `🏗️ Block Builder`

2. **만들고 싶은 블록 아이디어**
   - 예: 키보드 이벤트, 마우스 클릭, 타이머 등

---

## 🛠️ 사용 가능한 블록

### 1️⃣ 📦 Define Event Block
```
블록을 정의하는 메인 블록
```

**필드**:
- **Block Type**: 블록 ID (예: `my_key_event`)
- **Display Label**: 화면에 표시될 텍스트 (예: `⌨️ when key`)
- **Colour**: 블록 색상 (색상 선택기)
- **Parameters**: 파라미터 추가
- **Event Code**: 이벤트 발생 시 실행할 코드

---

### 2️⃣ ➕ Dropdown Parameter
```
드롭다운 선택 파라미터
```

**필드**:
- **Name**: 파라미터 이름 (예: `KEY`)
- **Options**: 선택지 (쉼표로 구분, 예: `space,enter,a,b`)

---

### 3️⃣ ➕ Text Parameter
```
텍스트 입력 파라미터
```

**필드**:
- **Name**: 파라미터 이름 (예: `MESSAGE`)
- **Default**: 기본값 (예: `Hello`)

---

### 4️⃣ ➕ Number Parameter
```
숫자 입력 파라미터
```

**필드**:
- **Name**: 파라미터 이름 (예: `AMOUNT`)
- **Default**: 기본값 (예: `10`)

---

### 5️⃣ get parameter
```
정의한 파라미터 값 가져오기
```

**필드**:
- **PARAM_NAME**: 파라미터 이름

---

## 🎓 튜토리얼: 키보드 이벤트 만들기

### Step 1: 블록 정의

```
[📦 Define Event Block]
  Block Type: [when_key_pressed]
  Display Label: [⌨️ when key]
  Colour: [#dc2626]
  Parameters:
    → [➕ Dropdown Parameter]
        Name: [KEY]
        Options: [space,enter,w,a,s,d]
  Event Code:
    → [say] [Hello!] for [1] seconds
```

### Step 2: 파라미터 사용하기

Event Code에서 파라미터를 사용하려면:

```
Event Code:
  → [say] [get parameter [KEY]] for [1] seconds
  → [move] [10] steps
```

### Step 3: Export!

1. **Library Manager** (📦 버튼) 열기
2. **Export** 탭 선택
3. 메타데이터 입력:
   ```
   Library Name: keyboard-events
   Version: 1.0.0
   Description: Custom keyboard events
   Author: Your Name
   Color: #dc2626
   ```
4. **📥 Download .blocklib.json** 클릭!

### Step 4: 설치 & 사용

1. Library Manager → **Install** 탭
2. **Paste JSON** 섹션에 JSON 붙여넣기
3. **Install from JSON** 클릭
4. F5 새로고침
5. 툴박스에 **📦 keyboard-events** 카테고리 생김!

---

## 📚 예제 모음

### 예제 1: 간단한 키보드 이벤트

```
[📦 Define Event Block]
  Block Type: [when_space_pressed]
  Display Label: [⌨️ when space pressed]
  Colour: [#ef4444]
  Parameters: (없음)
  Event Code:
    → [say] [Space!] for [0.5] seconds
    → [change y by] [50]
```

**생성되는 블록**:
```
⌨️ when space pressed
    → say "Space!" for 0.5 seconds
    → change y by 50
```

---

### 예제 2: 타이머 이벤트

```
[📦 Define Event Block]
  Block Type: [every_n_seconds]
  Display Label: [⏱️ every]
  Colour: [#f59e0b]
  Parameters:
    → [➕ Number Parameter]
        Name: [SECONDS]
        Default: [1]
  Event Code:
    → [say] [Tick!] for [0.3] seconds
```

**생성되는 블록**:
```
⏱️ every [1 ▼] seconds
    → say "Tick!" for 0.3 seconds
```

---

### 예제 3: 마우스 클릭 이벤트

```
[📦 Define Event Block]
  Block Type: [when_sprite_clicked]
  Display Label: [🖱️ when sprite clicked]
  Colour: [#8b5cf6]
  Parameters: (없음)
  Event Code:
    → [switch costume to] [next]
    → [say] [Clicked!] for [1] seconds
```

**생성되는 블록**:
```
🖱️ when sprite clicked
    → switch costume to next
    → say "Clicked!" for 1 seconds
```

---

### 예제 4: 조건부 이벤트 (고급)

```
[📦 Define Event Block]
  Block Type: [when_touching_edge]
  Display Label: [💥 when touching]
  Colour: [#ec4899]
  Parameters:
    → [➕ Dropdown Parameter]
        Name: [TARGET]
        Default: edge
        Options: [edge,sprite,mouse]
  Event Code:
    → [say] [Touching!] for [0.5] seconds
    → [move] [-10] steps
```

---

## 🔧 고급 기능

### 파라미터 값 활용

Event Code 안에서 파라미터 값을 사용:

```
Event Code:
  → [say] [You pressed] [get parameter [KEY]] for [1] seconds
```

이렇게 하면 사용자가 선택한 키 이름이 말풍선에 표시됩니다!

### 여러 파라미터 조합

```
Parameters:
  → [➕ Dropdown Parameter]
      Name: [KEY]
      Options: [w,a,s,d]
  → [➕ Number Parameter]
      Name: [SPEED]
      Default: [10]

Event Code:
  → [say] [Moving with speed] [get parameter [SPEED]]
  → [move] [get parameter [SPEED]] steps
```

---

## 📥 생성된 JSON 구조

Export하면 다음과 같은 JSON이 생성됩니다:

```json
{
  "name": "keyboard-events",
  "version": "1.0.0",
  "description": "Custom keyboard events",
  "author": "Your Name",
  "colour": "#dc2626",
  "blocks": [
    {
      "type": "when_key_pressed",
      "colour": "#dc2626",
      "tooltip": "Custom event: ⌨️ when key",
      "previousStatement": false,
      "nextStatement": false,
      "inputs": [
        {
          "kind": "dummy",
          "fields": [
            { "type": "label", "label": "⌨️ when key" },
            {
              "type": "dropdown",
              "name": "KEY",
              "options": [
                ["space", "space"],
                ["enter", "enter"]
              ]
            }
          ]
        },
        {
          "kind": "statement",
          "name": "DO",
          "label": ""
        }
      ]
    }
  ],
  "generators": {
    "js": {
      "when_key_pressed": "..."
    },
    "python": {
      "when_key_pressed": "..."
    }
  },
  "toolboxCategory": { ... }
}
```

---

## ⚠️ 주의사항

### 1. Block Type 규칙
```
✅ 좋은 예: my_event, when_key_pressed, on_timer
❌ 나쁜 예: My Event, when key pressed (공백 X)
```

### 2. 파라미터 이름 규칙
```
✅ 좋은 예: KEY, SECONDS, MESSAGE
❌ 나쁜 예: key name, my-param (공백/특수문자 X)
```

### 3. Options 형식
```
✅ 좋은 예: space,enter,a,b
❌ 나쁜 예: space, enter, a, b (공백 주의)
```

### 4. Export 전 확인
- Block Type이 유니크한지 확인
- 파라미터 이름이 겹치지 않는지 확인
- Event Code가 제대로 작동하는지 테스트

---

## 🎯 실전 워크플로우

### 1단계: 설계
```
어떤 이벤트를 만들까?
- 키보드? 마우스? 타이머?
- 어떤 파라미터가 필요할까?
```

### 2단계: 블록 정의
```
[📦 Define Event Block]으로 블록 만들기
Parameters 추가
Event Code 작성
```

### 3단계: 테스트
```
블록을 실제로 사용해보기
파라미터 값이 제대로 전달되는지 확인
```

### 4단계: Export
```
Library Manager → Export
메타데이터 입력
다운로드!
```

### 5단계: 공유
```
.blocklib.json 파일을:
- GitHub에 업로드
- 친구에게 전송
- 웹사이트에 호스팅
```

### 6단계: 설치
```
다른 사람들이:
Library Manager → Install → Paste JSON
→ 당신이 만든 블록 사용!
```

---

## 💡 팁 & 트릭

### Tip 1: 이모지 활용
```
Display Label에 이모지를 넣으면 예쁩니다!
⌨️ 🖱️ ⏱️ 💥 🎮 🔊 📡
```

### Tip 2: 색상 그룹화
```
같은 카테고리는 비슷한 색상 사용:
키보드: #dc2626 (빨강)
마우스: #8b5cf6 (보라)
타이머: #f59e0b (주황)
```

### Tip 3: 설명적인 이름
```
❌ ev1, my_block
✅ when_key_pressed, on_timer_tick
```

### Tip 4: 버전 관리
```
1.0.0 - 초기 버전
1.1.0 - 기능 추가
1.1.1 - 버그 수정
```

---

## 🐛 문제 해결

### Q: Export 시 "No block definitions found" 에러
A: `📦 Define Event Block` 블록이 워크스페이스에 있는지 확인

### Q: 파라미터가 Event Code에서 안 보여요
A: `get parameter [KEY]` 블록 사용

### Q: 설치했는데 블록이 안 보여요
A: F5로 페이지 새로고침

### Q: JSON 파싱 에러
A: Options에 불필요한 공백이 없는지 확인 (쉼표 직후 공백 X)

---

## 📖 관련 문서

- `KEYBOARD_EVENTS.md` - 이벤트 블록 상세 가이드
- `DEMO_SCRIPTS.md` - 시연용 예제
- `public/examples/` - 예제 스크립트

---

## 🚀 다음 단계

1. **기본 이벤트 블록 만들기** (키보드, 마우스)
2. **고급 이벤트 블록** (타이머, 충돌 감지)
3. **라이브러리 공유** (GitHub, 웹사이트)
4. **커뮤니티 빌딩** (다른 사람들의 라이브러리 사용)

---

**블록으로 블록을 만드는 시대!** 🎉

이제 여러분도 Blockly 라이브러리 개발자입니다! 🏗️
