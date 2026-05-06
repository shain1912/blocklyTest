"""
Demo 6: 키보드로 스프라이트 조종하기
목적: keyboard-events 라이브러리 시연
사전 준비: Library Manager에서 "keyboard-events" 설치 필요

⚠️ 주의: 이벤트 블록은 특별한 처리가 필요합니다!
이 코드는 Python으로만 개념을 보여주며, 실제 실행은 블록으로 해야 합니다.
"""

# Event: when space pressed
def on_key_Space():
    sprite.say("점프!", 0.5)
    sprite.change_y(50)

# Event: when ArrowUp pressed
def on_key_ArrowUp():
    sprite.move(10)

# Event: when ArrowDown pressed
def on_key_ArrowDown():
    sprite.move(-10)

# Event: when ArrowLeft pressed
def on_key_ArrowLeft():
    sprite.turn(-15)

# Event: when ArrowRight pressed
def on_key_ArrowRight():
    sprite.turn(15)

# Event: when a pressed (키보드 A키)
def on_key_a():
    sprite.switch_costume("cat")
    sprite.say("고양이!", 1)

# Event: when d pressed (키보드 D키)
def on_key_d():
    sprite.switch_costume("dog")
    sprite.say("강아지!", 1)

# 실제로는 이 함수들이 자동으로 이벤트 리스너에 연결됩니다
# JavaScript로 변환 시:
# window.addEventListener('keydown', (e) => { if (e.code === 'Space') { ... } })
