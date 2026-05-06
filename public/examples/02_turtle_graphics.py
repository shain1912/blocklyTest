"""
Demo 2: 거북이 그래픽 - 도형 그리기
목적: turtle-graphics 라이브러리 시연
사전 준비: Library Manager에서 "turtle-graphics" 설치 필요
"""

stage.switch_backdrop("white")
turtle.reset()
turtle.pendown()

# 빨간 사각형
turtle.color("red")
for i in range(4):
    turtle.forward(100)
    turtle.right(90)

# 파란 팔각형
turtle.penup()
turtle.goto(50, 50)
turtle.color("blue")
turtle.pendown()
for i in range(8):
    turtle.forward(60)
    turtle.right(45)

# 노란 별
turtle.penup()
turtle.goto(-80, -80)
turtle.color("yellow")
turtle.pendown()
for i in range(5):
    turtle.forward(100)
    turtle.right(144)
