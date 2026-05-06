"""
Demo 4: 애니메이션 쇼
목적: sprite-animations 라이브러리와 costume 변경 조합
사전 준비: Library Manager에서 "sprite-animations" 설치 필요
"""
import time

stage.switch_backdrop("blue-sky")

# 고양이 등장
sprite.switch_costume("cat")
sprite.say("고양이 쇼 시작!", 1)
# anim_jump(80)
# anim_shake(3)
time.sleep(1)

# 로봇 등장
sprite.switch_costume("robot")
sprite.say("로봇 등장!", 1)
# anim_spin(15)
time.sleep(1)

# 공 등장
sprite.switch_costume("ball")
# anim_blink(5)
sprite.say("끝!", 2)
