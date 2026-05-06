# BlockPy - Visual Block Programming with Python

Blockly 기반 비주얼 블록 프로그래밍 환경 + Python 양방향 변환 시스템

## 🚀 빠른 시작

```bash
# 설치
npm install

# 개발 서버 실행
npm run dev

# 브라우저에서 http://localhost:5173 접속
```

## ✨ 주요 기능

- 📦 **Block ↔ Python 양방향 변환**
- 🎨 **Stage & Sprite 시각화**
- 🐢 **Turtle Graphics 지원**
- 📚 **pip-style 라이브러리 시스템**
- 🎮 **게임 제작 유틸리티**

## 🎬 시연용 예제

프로젝트에 5개의 시연용 예제가 포함되어 있습니다:

1. **기본 움직임 & 배경** - 배경 전환과 스프라이트 변경
2. **거북이 그래픽** - 도형 그리기
3. **게임 점수 시스템** - 점수 추적 및 관리
4. **애니메이션 쇼** - 스프라이트 애니메이션
5. **우주 여행** - 모든 기능 통합 예제

📄 **자세한 내용**: [`DEMO_SCRIPTS.md`](./DEMO_SCRIPTS.md) 또는 [`public/examples/`](./public/examples/)

### 예제 사용법

```bash
# 1. 예제 파일 열기
cat public/examples/01_basic_backdrop.py

# 2. 코드 복사 → Python Editor에 붙여넣기
# 3. [▶ Run] 버튼 클릭 또는 [🔄 Convert]로 블록 변환
```

## 📦 라이브러리 시스템

설치 가능한 라이브러리:

- 🐢 **turtle-graphics** - 거북이 그래픽
- 🎮 **sprite-animations** - 애니메이션 효과
- 🎮 **game-utils** - 게임 제작 도구

Library Manager (📦 버튼)에서 원클릭 설치!

## 🛠️ 개발

```bash
# 테스트 실행
npm test

# 빌드
npm run build

# 프리뷰
npm run preview
```

## 📚 문서

- [시연 스크립트](./DEMO_SCRIPTS.md)
- [예제 모음](./public/examples/README.md)
- [에이전트 가이드](./AGENTS.md)
- [테스트 시나리오](./TEST_SCENARIOS.md)

## 🎯 프로젝트 구조

```
blocklyTest/
├── src/
│   ├── blocks/          # Blockly 블록 정의
│   ├── components/      # React 컴포넌트
│   ├── utils/           # 유틸리티 (transpiler, libraryManager)
│   └── App.jsx
├── public/
│   └── examples/        # 시연용 예제 스크립트
└── DEMO_SCRIPTS.md      # 시연 가이드
```

## 🐛 문제 해결

### 라이브러리 블록이 안 보여요
→ F5로 페이지 새로고침

### 스프라이트가 안 바뀌어요
→ `switch_costume("dog")` 철자 확인 (소문자)

### 배경 이름은?
→ `white`, `blue-sky`, `green`, `space`

## 📄 라이센스

MIT
