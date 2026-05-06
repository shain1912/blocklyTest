"""
Demo 5: 우주 여행 (종합 예제)
목적: 모든 기능 통합 시연
- 배경 전환 (green → space)
- 스프라이트 변경 (dog → robot → ball)
- 기본 움직임
- 거북이 그래픽
- 애니메이션
"""
import time

# === 1단계: 지구 출발 ===
stage.switch_backdrop("green")
sprite.switch_costume("dog")
sprite.say("지구에서 출발!", 2)

# 삼각형 이동
for i in range(3):
    sprite.move(40)
    sprite.turn(120)
    time.sleep(0.3)

# === 2단계: 우주 도착 ===
stage.switch_backdrop("space")
sprite.switch_costume("robot")
sprite.goto(0, 0)
sprite.say("우주 도착!", 2)

# === 3단계: 별 그리기 ===
turtle.reset()
turtle.pendown()
turtle.color("yellow")
for i in range(5):
    turtle.forward(50)
    turtle.right(72)
turtle.penup()

# === 4단계: 미션 완료 ===
sprite.switch_costume("ball")
sprite.say("미션 완료!", 2)
