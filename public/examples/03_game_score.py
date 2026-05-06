"""
Demo 3: 게임 만들기 - 점수 시스템
목적: game-utils 라이브러리 시연
사전 준비: Library Manager에서 "game-utils" 설치 필요
"""
import time

# 게임 초기화
game.init()
stage.switch_backdrop("green")
sprite.switch_costume("ball")
game.set_score(0)

# 공이 튀면서 점수 획득
for i in range(10):
    sprite.move(30)
    sprite.if_on_edge_bounce()
    game.change_score(10)

    # 현재 점수 표시
    score = game.get_score()
    sprite.say(f"점수: {score}", 0.5)
    time.sleep(0.3)

# 게임 종료
sprite.say(f"최종 점수: {game.get_score()}", 3)
game.game_over()
