# ⌨️ 키보드 이벤트 라이브러리 만들기 가이드

## 📦 설치 방법

### 방법 1: 내장 라이브러리로 설치 (완료!)
1. Library Manager 열기 (📦 버튼)
2. Install 탭
3. **⌨️ keyboard-events** 설치
4. F5 새로고침
5. 툴박스에 **⌨️ Keyboard** 카테고리 생성!

### 방법 2: JSON 파일로 설치
```bash
# public/examples/keyboard_events_library.json
```
Library Manager → Install 탭 → "Paste JSON"에 복사 붙여넣기

---

## 🎯 이벤트 블록의 특징

### 1. Hat Block (모자 블록)
```javascript
previousStatement: false  // 위에 블록 연결 불가
nextStatement: false      // 아래 블록 연결 불가
```
→ 독립적으로 실행되는 이벤트 핸들러

### 2. Statement Input
```javascript
{
  kind: 'statement',
  name: 'DO',
  label: ''
}
```
→ 내부에 블록을 넣을 수 있음

### 3. JavaScript 코드 생성
```javascript
event_when_key_pressed: `
  const key = block.getFieldValue('KEY');
  const code = javascriptGenerator.statementToCode(block, 'DO');

  return \`
    window.addEventListener('keydown', async (e) => {
      if (e.code === '\${key}' || e.key === '\${key}') {
        \${code}
      }
    });
  \`;
`
```

---

## 📝 블록 구성

### 1️⃣ event_when_key_pressed
```
⌨️ when key [space ▼] pressed
    → [블록들...]
```

**기능**: 특정 키가 눌렸을 때 실행

**사용 예**:
```
⌨️ when key [space] pressed
    → say "점프!" for 1 seconds
    → change y by 50
```

**생성 코드** (JavaScript):
```javascript
window.addEventListener('keydown', async (e) => {
  if (e.code === 'Space' || e.key === 'Space') {
    await window.spriteController.say("점프!", 1);
    await window.spriteController.changeY(50);
  }
});
```

**생성 코드** (Python):
```python
# Event: when Space pressed
def on_key_Space():
    sprite.say("점프!", 1)
    sprite.change_y(50)
```

---

### 2️⃣ event_when_any_key_pressed
```
⌨️ when any key pressed
    → [블록들...]
```

**기능**: 아무 키나 눌렸을 때 실행

**사용 예**:
```
⌨️ when any key pressed
    → say "키보드 누름!" for 0.5 seconds
```

---

### 3️⃣ event_is_key_pressed
```
key [space ▼] pressed?
```

**기능**: 특정 키가 현재 눌려있는지 체크 (boolean 반환)

**사용 예**:
```
repeat forever
    → if <key [ArrowUp] pressed?>
        → move 10 steps
```

---

## 🎮 실전 예제: WASD 조종

### 블록 구성:
```
⌨️ when key [w] pressed
    → move 10 steps

⌨️ when key [s] pressed
    → move -10 steps

⌨️ when key [a] pressed
    → turn left 15 degrees

⌨️ when key [d] pressed
    → turn right 15 degrees

⌨️ when key [space] pressed
    → switch costume to next
```

### 생성되는 JavaScript:
```javascript
// Event: when w pressed
window.addEventListener('keydown', async (e) => {
  if (e.code === 'w' || e.key === 'w') {
    await window.spriteController.move(10);
  }
});

// Event: when s pressed
window.addEventListener('keydown', async (e) => {
  if (e.code === 's' || e.key === 's') {
    await window.spriteController.move(-10);
  }
});

// ... (나머지 이벤트들)
```

---

## 🔧 커스텀 이벤트 블록 만들기

### 템플릿:
```javascript
{
  name: 'my-custom-events',
  version: '1.0.0',
  description: '나만의 이벤트 블록',
  colour: '#8b5cf6',
  blocks: [
    {
      type: 'event_when_sprite_clicked',
      colour: '#8b5cf6',
      tooltip: '스프라이트를 클릭했을 때',
      previousStatement: false,  // ⭐ Hat block
      nextStatement: false,
      inputs: [
        {
          kind: 'dummy',
          fields: [
            { type: 'label', label: '🖱️ when sprite clicked' }
          ]
        },
        {
          kind: 'statement',
          name: 'DO',
          label: ''
        }
      ]
    }
  ],
  generators: {
    js: {
      event_when_sprite_clicked: `
        const code = javascriptGenerator.statementToCode(block, 'DO');
        return \`
          document.querySelector('.sprite').addEventListener('click', async () => {
            \${code}
          });
        \`;
      `
    },
    python: {
      event_when_sprite_clicked: `
        const code = pythonGenerator.statementToCode(block, 'DO') || '  pass\\n';
        return \`# Event: when sprite clicked\\ndef on_sprite_click():\\n\${code}\\n\`;
      `
    }
  }
}
```

---

## 🎯 다른 이벤트 블록 예시

### 🖱️ 마우스 이벤트
```javascript
{
  type: 'event_when_mouse_clicked',
  previousStatement: false,
  nextStatement: false,
  inputs: [
    { kind: 'dummy', fields: [{ label: '🖱️ when mouse clicked' }] },
    { kind: 'statement', name: 'DO' }
  ]
}
```

### ⏱️ 타이머 이벤트
```javascript
{
  type: 'event_every_n_seconds',
  inputs: [
    { kind: 'dummy', fields: [
      { label: '⏱️ every' },
      { type: 'number', name: 'SECONDS', default: 1 },
      { label: 'seconds' }
    ]},
    { kind: 'statement', name: 'DO' }
  ]
}
```

### 📡 충돌 감지 이벤트
```javascript
{
  type: 'event_when_touching',
  inputs: [
    { kind: 'dummy', fields: [
      { label: '💥 when touching' },
      { type: 'dropdown', name: 'TARGET', options: [
        ['edge', 'edge'],
        ['sprite', 'sprite']
      ]}
    ]},
    { kind: 'statement', name: 'DO' }
  ]
}
```

---

## ⚠️ 주의사항

### 1. Hat Block은 반드시:
```javascript
previousStatement: false
nextStatement: false
```

### 2. 이벤트 리스너 중복 방지
```javascript
// ❌ 나쁜 예: 매번 새 리스너 추가
window.addEventListener('keydown', handler);

// ✅ 좋은 예: 기존 리스너 제거 후 추가
window.removeEventListener('keydown', existingHandler);
window.addEventListener('keydown', newHandler);
```

### 3. Python 변환 시 함수명 규칙
```python
# 키 이름을 Python 함수명으로 변환
"ArrowUp" → "on_key_ArrowUp"
"space" → "on_key_space"
"a" → "on_key_a"
```

---

## 🚀 고급: 이벤트 디스패처 시스템

실제 프로덕션에서는 중앙 이벤트 관리자를 만드는 것이 좋습니다:

```javascript
// eventManager.js
class EventManager {
  constructor() {
    this.handlers = {};
  }

  on(eventType, key, handler) {
    const eventKey = `${eventType}:${key}`;
    this.handlers[eventKey] = handler;
  }

  trigger(eventType, key) {
    const eventKey = `${eventType}:${key}`;
    if (this.handlers[eventKey]) {
      this.handlers[eventKey]();
    }
  }
}

window.eventManager = new EventManager();

// 실제 사용
window.addEventListener('keydown', (e) => {
  window.eventManager.trigger('keydown', e.code);
});
```

---

## 📦 완성된 라이브러리

현재 설치된 **keyboard-events** 라이브러리:

✅ `event_when_key_pressed` - 특정 키 이벤트
✅ `event_when_any_key_pressed` - 모든 키 이벤트
✅ `event_is_key_pressed` - 키 상태 체크

**사용 가능한 키**:
- space, enter
- ArrowUp, ArrowDown, ArrowLeft, ArrowRight
- a, b, c, d, w, s

---

## 💡 팁

1. **이벤트 블록은 워크스페이스 최상단에 배치**
2. **여러 이벤트 동시 사용 가능** (각각 독립 실행)
3. **`key pressed?` 블록으로 조합키 구현 가능**
   ```
   repeat forever
       if <key [w] pressed?> and <key [space] pressed?>
           → say "W+Space 동시 누름!"
   ```

Happy Coding! 🎉
