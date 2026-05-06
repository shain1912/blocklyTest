# 투고 전략과 저널 적합도 가안

## 1. 결론 먼저

현재 주제에서 가장 먼저 노릴 만한 1순위는 `IEEE Transactions on Learning Technologies (TLT)`다. 이유는 이 논문이 단순 수업 사례가 아니라 `학습기술 자체의 설계`, `양방향 변환기`, `브라우저 런타임`, `실행 브리지`, `로그 분석`을 포함한 기술 시스템 논문이기 때문이다.

다만 TLT는 기술이 참신해야 하고, 학습 지원 효과도 설득력 있게 보여야 한다. 따라서 `기술 신규성`과 `학습 근거` 둘 다 필요하다. 기술 기여가 약해지면 `IEEE Transactions on Education (ToE)` 또는 `Education and Information Technologies (EAIT)` 쪽으로 전환하는 것이 현실적이다.

## 2. 1차 후보 저널

### 2.1 IEEE Transactions on Learning Technologies

적합도: 매우 높음

근거:

- TLT는 학습기술과 그 응용 전반을 다루며, 온라인 학습 시스템, 평가 도구, 학습분석, 저작도구, 협업 도구 등을 포함한다고 명시한다 [J1].
- 더 중요하게는, TLT는 `기술 평가 논문은 기술 자체가 새롭거나 유의미한 기술적 통찰을 제공할 때만 적합하다`고 밝히고, `substantive technical and/or design knowledge`와 `how the technologies can be used to support learning`을 함께 요구한다 [J1].

이 논문이 TLT에 맞는 이유:

- 양방향 블록-텍스트 변환기
- 브라우저 내부 Python 인터프리터
- Worker 기반 실행 구조
- JavaScript- Python 브리지
- 학습 로그 분석

이건 단순 교육 적용이 아니라 학습기술 자체의 설계와 구현이다.

TLT에 내기 위해 꼭 필요한 것:

- 기존 시스템 대비 기술적 신규성 명확화
- 블록-텍스트 전환 지원 도구들과의 차이
- 브라우저 Python 런타임 통합의 기술 난점 설명
- 시스템 성능평가 + 학습효과평가를 둘 다 제시

### 2.2 IEEE Transactions on Education

적합도: 높음

근거:

- ToE는 컴퓨터공학과 컴퓨터과학 교육을 포함하는 IEEE 범위의 교육 연구를 받는다 [J2].
- 특히 `논문의 주장과 기여는 compelling evidence로 뒷받침되어야 하며, 일반적으로 학생 자기보고나 태도 자료를 넘어서는 평가가 필요하다`고 명시한다 [J2].

이 논문이 ToE에 맞는 이유:

- Python 교육, 블록-텍스트 전환, 실행환경, 수업 적용이라는 교육적 맥락이 뚜렷하다.
- 단, ToE는 기술보다 `교육 증거`를 더 세게 요구한다.

ToE에 내기 위해 꼭 필요한 것:

- 사전/사후 검사
- 대조군
- 실제 성능 과제
- 자기보고를 넘는 객관지표
- 명확한 수업 맥락 기술

### 2.3 Education and Information Technologies

적합도: 높음

근거:

- EAIT는 정보통신기술과 교육 간의 복합적 관계를 다루며, 특정 교실 응용부터 국가 정책, 유아부터 성인 고등교육까지 폭넓은 범위를 포괄한다고 소개한다 [J3].
- 2026년 4월 기준 최신 기사 목록에서도 GenAI, 자동 피드백, 디지털 역량, LMS 분석처럼 매우 넓은 ICT-in-education 연구를 다루고 있다 [J3].

이 논문이 EAIT에 맞는 이유:

- 브라우저 Python, 블록-텍스트 전환, AI 지원, 학습 로그라는 조합이 EAIT 범위와 잘 맞는다.
- 비교적 폭넓은 교육기술 논문과 함께 실릴 수 있다.

EAIT에 내기 위해 꼭 필요한 것:

- 기술 구현 설명
- 교육 맥락과 실제 적용성
- 통계 분석
- 관련연구 폭넓은 정리

주의:

- EAIT는 너무 기술 중심으로 쓰면 소프트웨어 보고서처럼 보일 수 있다.
- 반대로 너무 교육 서사 중심으로 쓰면 시스템 신규성이 묻힌다.

### 2.4 Educational Technology Research and Development

적합도: 중간 이상

근거:

- ETR&D는 엄격한 정량·정성·혼합방법 연구와 기술/교수설계 응용을 다루며, Development 섹션은 `planning, implementation, evaluation and management of instructional technologies and learning environments`를 받는다 [J4].

맞는 경우:

- 이론 프레임을 더 강하게 세우고
- 설계기반연구 또는 mixed methods로 확장하고
- 설계 의사결정과 결과의 연결을 깊게 설명할 때

현재 상태에서의 위치:

- 기술 신규성은 충분히 설명 가능하지만, 학습이론 프레임이 약하면 ETR&D에서는 밀릴 수 있다.

### 2.5 Journal of Computing in Higher Education

적합도: 조건부

근거:

- JCHE는 higher education에서 기술이 학습에 미치는 함의를 다루며, 요즘은 `pressing problems`를 해결하는 연구를 선호한다고 밝힌다 [J5].
- 또한 이론틀, 연구질문, 방법론 정합성을 매우 강하게 요구하고, 과장된 서론 표현을 피하라고 명시한다 [J5].

맞는 경우:

- 대학 Python 기초수업 맥락으로 실험이 돌아가고
- 명확한 theoretical framework를 세울 수 있을 때

현재 상태에서의 위치:

- 학부 CS1 또는 교양코딩 맥락이면 맞을 수 있다.
- 하지만 컴퓨터과학적 시스템 신규성은 JCHE보다 TLT에서 더 잘 평가될 가능성이 높다.

## 3. 추천 투고 순서

### 시나리오 A: 기술 기여를 강하게 밀 경우

1. TLT
2. EAIT
3. ToE

### 시나리오 B: 실제 수업 실험과 교육 증거가 매우 강할 경우

1. ToE
2. TLT
3. EAIT

### 시나리오 C: 이론틀과 mixed methods를 더 세게 붙일 경우

1. ETR&D
2. TLT
3. JCHE

## 4. 현재 원고 기준 부족한 점

현재 초안은 방향은 좋지만, 아래가 없으면 상위 저널에서 약하다.

- 실제 실험 데이터
- 대조군 비교
- 실행 충실도 벤치마크
- 명확한 지원 구문 범위 정의
- 실패 사례 분석
- 장기 유지 효과
- AI 보조 기능의 위험 통제

## 5. 반드시 추가할 실험

### 5.1 시스템 실험

- 로컬 CPython 대비 결과 일치율
- 브라우저별 런타임 성능 비교
- Worker 사용 유무에 따른 UI 응답성 비교
- 패키지 로드 시간 비교
- 지원 API 집합별 동작 일치율

### 5.2 교육 실험

- blocks-only vs dual-modality vs text-only
- AI on vs off
- 사전/사후 + 지연사후
- 전이 과제
- 디버깅 과제

### 5.3 로그 분석

- 전환 횟수와 성과의 관계
- 오류 유형 변화
- AI 사용 목적과 성과의 관계
- 실행 횟수와 완성도 관계

## 6. 저널별 어셉트 관점 체크

### TLT 체크

- 기술이 실제로 새롭나?
- 기술적 구현에서 배울 것이 있나?
- 학습에 왜 도움이 되는지 증거가 있나?

### ToE 체크

- 학생 자기보고 말고 실제 성과가 있나?
- 교육 개입이 재현 가능하게 설명되었나?
- 수업 맥락과 평가도구가 명확한가?

### EAIT 체크

- ICT와 교육의 연결이 분명한가?
- 실제 적용성과 확장성이 있나?
- 통계와 논의가 충분한가?

### ETR&D 체크

- 이론틀이 강한가?
- 설계 의사결정이 연구적으로 설명되었나?
- mixed methods 또는 개발 연구로서 깊이가 있나?

### JCHE 체크

- higher education problem이 분명한가?
- 기술 자체보다 학습 문제 해결에 초점이 맞춰졌나?
- 이론틀이 전 장에서 일관되게 유지되나?

## 7. 내 판단

당장 가장 설득력 있는 프레임은 아래다.

`기술 논문처럼 쓰고, 교육 증거로 닫는다.`

즉:

- 제목과 서론은 `변환기 + 런타임 + 실행환경`
- 관련연구는 `전환 연구 + 브라우저 Python + 학습분석`
- 본문 중심은 `시스템 설계`
- 평가 장은 `시스템 성능 + 교육 효과`

이 구조면 우균 교수 톤과도 가장 잘 맞고, TLT/ToE/EAIT 어느 쪽으로도 분기하기 좋다.

## 8. 근거 링크

[J1] IEEE Transactions on Learning Technologies: https://ieee-edusociety.org/publication/about-publications/tlt  
[J2] IEEE Transactions on Education: https://ieee-edusociety.org/publication/about-publications/toe  
[J3] Education and Information Technologies: https://link.springer.com/journal/10639  
[J4] Educational Technology Research and Development: https://link.springer.com/journal/11423/aims-and-scope  
[J5] Journal of Computing in Higher Education: https://link.springer.com/journal/12528/aims-and-scope
