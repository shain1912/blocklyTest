"""
Demo 1: 기본 움직임 & 배경 전환
목적: 새로운 배경과 스프라이트 costume 기능 시연
"""
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
