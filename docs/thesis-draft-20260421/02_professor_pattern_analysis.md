# 우균 교수 연구·문체 패턴 분석 가안

## 1. 분석 기준

이 문서는 공개 검색 가능한 자료만을 기준으로 작성했다. 핵심 근거는 다음 네 묶음이다.

- 부산대학교 공식 교수 프로필
- 부산대학교 프로그래밍언어연구실 소개
- 부산대학교 2025년 졸업과제 안내
- DBLP에 수록된 대표 논문 목록

공식 프로필에서는 우균 교수의 전공분야를 `프로그래밍 언어 및 컴파일러`로 제시한다. 연구실 소개에서는 명령형, 함수형, 논리, 객체지향 언어와 프로그램 분석, 응용분야 연구를 강조한다. 최근 졸업과제 안내에서는 `머꼬`, `KoBASIC`, `i새싹`, Python 모듈 확장, GUI 설치관리자, 인터프리터 구현 등을 직접 언급한다. 이 조합은 현재도 연구 관심이 `교육 일반론`이 아니라 `언어 설계`, `인터프리터/컴파일러`, `도구화`, `한글 프로그래밍 언어`, `실행환경`에 놓여 있음을 보여준다.

## 2. 공개 업적에서 보이는 대표 연구축

### 2.1 프로그래밍 언어와 컴파일러

- 공식 프로필의 전공 자체가 `프로그래밍 언어 및 컴파일러`다.
- 2025년 졸업과제에서 `머꼬`, `KoBASIC`, `i새싹` 인터프리터, Python 모듈 확장, GUI 탑재, 설치 관리자까지 제시한 점은 여전히 구현 중심 연구를 선호한다는 신호다.
- DBLP에는 `An Intermediate Representation Approach to Reducing Test Suites for Retargeted Compilers` 계열 연구가 확인된다. 즉, 단순 사용자 인터페이스가 아니라 컴파일러 검증과 중간표현까지 연구 관심이 연결된다.

### 2.2 소스코드 분석과 표절 탐지

2007~2012년 공개 논문들에서 가장 선명하게 보이는 축이다.

- `A source code linearization technique for detecting plagiarized programs`
- `Understanding the evolution process of program source for investigating software authorship and plagiarism`
- `Evolution Analysis of Homogenous Source Code and its Application to Plagiarism Detection`
- `Plagiarism Detection among Source Codes using Adaptive Methods`

이 계열은 공통적으로 `코드의 표면이 아니라 구조를 어떻게 표현하고 비교할 것인가`를 다룬다. 즉, 언어적 표현을 분석 가능한 내부 표현으로 바꾸는 관점이 강하다.

### 2.3 교육용 도구와 학습 지원 시스템

교육을 다루더라도 교육심리학적 수사를 길게 끌기보다, `도구`, `언어`, `분석 시스템`, `시각화`로 접근하는 경향이 보인다.

- `Source code management system for E-learning based programming education`
- `Style Avatar: a visualization system for teaching C coding style`

교육 목적이 있더라도 서술의 중심은 `플랫폼이 무엇을 자동화했고, 어떤 구조를 갖고, 무엇을 측정했는가`에 놓인다.

### 2.4 한글 프로그래밍 언어와 실행 안전성

국내 논문과 최근 과제 소개를 보면 한글 프로그래밍 언어가 단발성 흥미 주제가 아니라 꾸준한 축이다.

- 한글 언어 `새싹`
- `KoBASIC`
- 머꼬
- Python 모듈을 사용할 수 있도록 확장

여기에 `실행 안전성`, `보안 규칙`, `인터프리터` 같은 키워드가 결합한다. 즉, 한국어 친화성은 단순 번역 UI가 아니라 `언어 설계와 실행 모델`의 문제로 다뤄진다.

### 2.5 코드/실행 환경의 식별과 분석

최근 공개 논문 중 `API 서열 분석을 이용한 C# 난독화 도구 식별`은 언어 처리와 분석, 패턴 추출, 식별 문제에 대한 관심이 현재도 이어짐을 보여준다. 이는 당신 논문에서 `학습 로그 기반 행태 분석`, `AI 사용 패턴 분석`, `변환 실패 유형 분류` 같은 부분과 자연스럽게 맞닿는다.

## 3. 문체 패턴

### 3.1 제목은 설명형이고 직설적이다

대표 제목들은 대부분 문제와 방법을 바로 드러낸다.

- A source code linearization technique for detecting plagiarized programs
- Source code management system for E-learning based programming education
- An Intermediate Representation Approach to Reducing Test Suites for Retargeted Compilers

권장 방향도 같다. 논문 제목은 감성적이거나 포괄적인 표현보다, `무엇을 설계했고 어떤 문제를 해결했는가`가 바로 드러나야 한다.

### 3.2 서론은 큰 담론보다 실제 문제에서 시작한다

공개된 연구 제목과 초록 성격을 종합하면, 다음 순서가 반복된다.

1. 실제 현장의 기술적 문제 제시
2. 기존 접근의 한계
3. 제안 시스템/방법의 핵심 아이디어
4. 구현과 평가의 요약

즉, `4차 산업혁명`, `AI 시대`, `패러다임 전환` 같은 과장된 서두보다, `블록 환경은 진입장벽을 낮추지만 텍스트 전환과 실행 일관성에 약하다`처럼 직접적인 문제 정의가 더 잘 맞는다.

### 3.3 교육 논문도 시스템 논문처럼 쓴다

교육을 다루더라도 다음 요소가 전면에 온다.

- 시스템 구조
- 내부 표현
- 알고리즘 또는 처리 절차
- 시각화/분석 기법
- 정량 평가

따라서 당신 논문도 `학생 친화적`, `몰입형 학습경험`, `창의적 문제해결` 같은 문구만으로 밀면 약하다. 대신 아래 표현이 맞다.

- 양방향 변환
- 의미 동등성
- 실행 충실도
- 브라우저 런타임
- 패키지 확장
- 이벤트 브리지
- 로그 기반 분석

### 3.4 구현 가능성과 재현성을 중요하게 본다

공개 연구들은 대개 `아이디어`보다 `동작하는 시스템`이 있다. 구현 언어, 실행 구조, 비교 방법, 정량적 결과가 같이 붙는다. 따라서 초안에서도 아키텍처 그림, 실행 파이프라인, 로그 스키마, 실험 프로토콜을 분리해서 써야 한다.

## 4. 당신 논문에 맞는 프레이밍

## 4.1 피해야 할 프레이밍

- “AI와 블록코딩을 결합한 혁신적 교육 플랫폼”
- “미래교육을 위한 차세대 에듀테크 서비스”
- “학습자의 흥미를 높이는 통합형 코딩 솔루션”

이런 표현은 너무 넓고, 기술적 신규성이 흐려진다.

## 4.2 추천 프레이밍

- `양방향 블록-텍스트 변환과 브라우저 내 Python 실행을 지원하는 교육용 다중표현 프로그래밍 시스템`
- `Blockly와 WebAssembly 기반 Python 런타임을 결합한 학습용 언어 실행환경`
- `초보 학습자의 전환 문제를 완화하기 위한 의미 일관적 블록-텍스트 프로그래밍 플랫폼`

핵심은 `에듀테크 앱`이 아니라 `프로그래밍 언어 시스템`으로 보이게 하는 것이다.

## 5. 논문에서 강조해야 할 기술 키워드

- intermediate representation
- semantic consistency
- bidirectional transformation
- execution fidelity
- browser-resident runtime
- WebAssembly-based interpreter
- package loading and bridging
- event-driven execution model
- learning analytics instrumentation
- Korean-friendly educational programming language design

## 6. 논문에서 약하게 써야 할 키워드

- 혁신적
- 변혁적
- 패러다임 전환
- 미래지향적
- 몰입감 극대화
- 흥미 유발

이런 표현은 완전히 금지할 필요는 없지만, 지도교수 취향과 공개 논문 톤을 기준으로 보면 중심어가 되면 안 된다.

## 7. 본문 서술 원칙

### 7.1 서론

- 사회적 중요성은 짧게
- 기술적 문제 정의는 길게
- 기존 시스템의 한계는 구체적으로
- 공헌은 번호를 매겨 명시적으로

### 7.2 관련연구

- 도구 이름 나열보다 분류 체계 제시
- 블록 전환, 브라우저 Python, 한국어 친화 언어, AI 보조 학습을 별도 축으로 분리
- “무엇이 아직 비어 있는가”를 끝에 분명히 적기

### 7.3 시스템 장

- 구성요소 설명 순서를 `표현 계층 -> 변환 계층 -> 실행 계층 -> 분석 계층`처럼 고정
- 각 계층의 입력, 출력, 실패 조건, 확장 방법을 기술
- 내부 자료구조나 IR이 있으면 반드시 그림과 표로 보이기

### 7.4 평가 장

- 시스템 성능평가와 교육효과평가를 분리
- 교육효과는 자기보고만으로 끝내지 말고 성능, 전이, 유지, 로그를 함께 제시
- 가능하면 사전/사후 + 대조군 + 지연사후까지 넣기

## 8. 최종 조언

이 논문은 `컴퓨터사이언스 기반 에듀테크`가 아니라, `교육 문제를 해결하는 프로그래밍 언어 및 실행환경 연구`처럼 보여야 가장 강하다. 우균 교수 공개 연구 패턴과 가장 잘 맞는 문장은 다음에 가깝다.

`본 연구는 블록 기반 학습 환경과 범용 Python 실행 환경 사이의 의미적 단절을 해소하기 위해, 양방향 변환기와 브라우저 내 인터프리터를 결합한 교육용 프로그래밍 시스템을 설계하고 그 실행 충실도와 교육적 효과를 평가한다.`

## 공개 자료 링크

- 부산대학교 교수 프로필: https://cse.pusan.ac.kr/pnuProfl/cse/455/4218/artclView.do
- 부산대학교 프로그래밍언어연구실 소개: https://cse.pusan.ac.kr/bbs/cse/2612/404560/artclView.do
- 부산대학교 2025 졸업과제 안내: https://cse.pusan.ac.kr/bbs/cse/12549/1712196/artclView.do
- DBLP Gyun Woo: https://dblp.org/pid/46/3626.html
