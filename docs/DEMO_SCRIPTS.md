# 🎬 시연용 데모 스크립트

## 📋 목차
1. [기본 움직임 & 배경](#1-기본-움직임--배경)
2. [거북이 그래픽 - 사각형 그리기](#2-거북이-그래픽---사각형-그리기)
3. [게임 만들기 - 점수 시스템](#3-게임-만들기---점수-시스템)
4. [애니메이션 - 스프라이트 쇼](#4-애니메이션---스프라이트-쇼)
5. [복합 예제 - 우주 여행](#5-복합-예제---우주-여행)

---

## 1. 기본 움직임 & 배경

**목적**: 새로운 배경과 스프라이트 기능 시연

### 블록 구성:
```
[when flag clicked]
  → switch backdrop to [blue-sky]
  → switch costume to [dog]
  → say [안녕! 나는 강아지야!] for [2] seconds
  → repeat [4] times
      → move [50] steps
      → turn [right] [90] degrees
      → wait [0.5] seconds
  → switch backdrop to [space]
  → switch costume to [robot]
  → say [우주로 출발!] for [2] seconds
```

### Python 코드:
```python
import time

# 배경을 파란 하늘로
stage.switch_backdrop("blue-sky")

# 강아지 스프라이트로 변경
sprite.switch_costume("dog")
sprite.say("안녕! 나는 강아지야!", 2)

# 사각형 그리기
for i in range(4):
    sprite.move(50)
    sprite.turn(90)
    time.sleep(0.5)

# 우주 배경으로 전환
stage.switch_backdrop("space")
sprite.switch_costume("robot")
sprite.say("우주로 출발!", 2)
```

---

## 2. 거북이 그래픽 - 사각형 그리기

**목적**: turtle-graphics 라이브러리 시연

### 사전 준비:
1. Library Manager 열기 (📦 버튼)
2. Install 탭
3. "🐢 turtle-graphics" 설치

### 블록 구성:
```
[when flag clicked]
  → switch backdrop to [white]
  → 🐢 turtle start
  → 🖊 pen down
  → 🎨 color [red]
  → repeat [4] times
      → forward [100]
      → right [90]
  → ✋ pen up
  → 🎨 color [blue]
  → 🖊 pen down
  → goto x [50] y [50]
  → repeat [8] times
      → forward [60]
      → right [45]
```

### Python 코드:
```python
stage.switch_backdrop("white")
turtle.reset()
turtle.pendown()
turtle.color("red")

# 빨간 사각형
for i in range(4):
    turtle.forward(100)
    turtle.right(90)

turtle.penup()
turtle.color("blue")
turtle.pendown()
turtle.goto(50, 50)

# 파란 팔각형
for i in range(8):
    turtle.forward(60)
    turtle.right(45)
```

---

## 3. 게임 만들기 - 점수 시스템

**목적**: game-utils 라이브러리 시연

### 사전 준비:
1. Library Manager에서 "🎮 Game Utils" 설치

### 블록 구성:
```
[when flag clicked]
  → 🎮 game start
  → switch backdrop to [green]
  → switch costume to [ball]
  → set score to [0]
  → repeat [10] times
      → move [30] steps
      → if on edge, bounce
      → change score by [10]
      → say [score] for [0.5] seconds
      → wait [0.3] seconds
  → 🛑 game over
```

### Python 코드:
```python
import time

game.init()
stage.switch_backdrop("green")
sprite.switch_costume("ball")
game.set_score(0)

for i in range(10):
    sprite.move(30)
    sprite.if_on_edge_bounce()
    game.change_score(10)
    score = game.get_score()
    sprite.say(str(score), 0.5)
    time.sleep(0.3)

game.game_over()
```

---

## 4. 애니메이션 - 스프라이트 쇼

**목적**: sprite-animations 라이브러리와 costume 변경 조합

### 사전 준비:
1. Library Manager에서 "🎮 Animations" 설치

### 블록 구성:
```
[when flag clicked]
  → switch backdrop to [blue-sky]
  → switch costume to [cat]
  → say [고양이 쇼 시작!] for [1] seconds
  → 🦘 jump height [80]
  → 💥 shake times [3]

  → switch costume to [robot]
  → say [로봇 등장!] for [1] seconds
  → 🌀 spin speed [15]

  → switch costume to [ball]
  → ✨ blink times [5]
  → say [끝!] for [2] seconds
```

---

## 5. 복합 예제 - 우주 여행

**목적**: 모든 기능 종합 시연

### 블록 구성:
```
[when flag clicked]
  → switch backdrop to [green]
  → switch costume to [dog]
  → say [지구에서 출발!] for [2] seconds

  → repeat [3] times
      → move [40] steps
      → turn [right] [120] degrees

  → switch backdrop to [space]
  → switch costume to [robot]
  → 🦘 jump height [100]
  → say [우주 도착!] for [2] seconds

  → 🐢 turtle start
  → 🖊 pen down
  → 🎨 color [yellow]
  → repeat [5] times
      → forward [50]
      → right [72]

  → ✋ pen up
  → switch costume to [ball]
  → ✨ blink times [3]
  → say [미션 완료!] for [2] seconds
```

### Python 코드:
```python
import time

# 지구 출발
stage.switch_backdrop("green")
sprite.switch_costume("dog")
sprite.say("지구에서 출발!", 2)

# 삼각형 이동
for i in range(3):
    sprite.move(40)
    sprite.turn(120)

# 우주 도착
stage.switch_backdrop("space")
sprite.switch_costume("robot")
# 점프 애니메이션
sprite.say("우주 도착!", 2)

# 별 그리기
turtle.reset()
turtle.pendown()
turtle.color("yellow")
for i in range(5):
    turtle.forward(50)
    turtle.right(72)

# 마무리
turtle.penup()
sprite.switch_costume("ball")
# 깜빡임 애니메이션
sprite.say("미션 완료!", 2)
```

---

## 💡 시연 팁

### 시연 순서 (5분 데모):
1. **1분**: 기본 움직임 & 배경 (신기능 강조)
2. **1분**: Library Manager 소개 → turtle-graphics 설치
3. **2분**: 거북이 그래픽으로 도형 그리기
4. **1분**: 복합 예제 실행 (모든 기능 통합)

### 강조할 포인트:
- ✅ **배경 전환** (4가지 배경)
- ✅ **스프라이트 변경** (6가지: cat, dog, turtle, robot, ball, arrow)
- ✅ **라이브러리 시스템** (pip처럼 설치/제거)
- ✅ **Python ↔ Block 양방향 변환**
- ✅ **실시간 Stage 미리보기**

### 발표 스크립트:
> "이제 새로운 기능을 보여드리겠습니다. 배경을 우주로 바꾸고, 스프라이트를 로봇으로 변경할 수 있습니다.
> 또한 pip처럼 동작하는 Library Manager를 통해 turtle-graphics나 game-utils 같은
> 확장 라이브러리를 원클릭으로 설치할 수 있습니다."

---

## 📦 설치 가능한 라이브러리

1. **🐢 turtle-graphics** (v1.1.0)
   - 거북이 그래픽 그리기
   - forward, backward, left, right, penup, pendown, color

2. **🎮 Animations** (v1.0.0)
   - 스프라이트 애니메이션
   - jump, shake, spin, blink

3. **🎮 Game Utils** (v1.0.0)
   - 게임 제작 유틸리티
   - 점수 관리, 충돌 감지, game over
