# Python→Blocks 리팩터링 재검토 보고서

- 작성일: 2026-04-21
- 대상 브랜치/워킹트리: 현재 로컬 작업본
- 리뷰 초점:
  - Python → Blocks canonical path가 실제로 exactness를 보장하는지
  - semantic overlay가 exact layer를 다시 깨고 있지는 않은지
  - 이전에 지적했던 `py pass`, attr flattening, silent fallback, test collision 등이 얼마나 해소됐는지

## 1. 결론 요약

이번 변경은 분명히 큰 진전이다. 이전 리뷰 시점과 비교하면 exact block 계층이 실제로 들어왔고, AST 경로도 canonical path에 훨씬 가까워졌다. 특히 아래는 의미 있는 개선이다.

- `None`, `bool`, `attr`, `subscript`, `slice`, `tuple/list/dict`, `f-string`에 대한 구조 블록이 추가됐다.
- `ok, frame = cap.read()` 같은 tuple assignment가 더 이상 바로 `py pass`로 무너지지 않고 `py_tuple_assign`로 내려간다.
- `with`, `try`, `raise`, `return`도 최소한 raw fallback이 아니라 별도 exact-ish block으로 표현된다.
- Python backend offline 상태를 UI에서 degraded mode로 노출한다.
- 테스트 스크립트가 `vitest --dir src`로 바뀌어 이전의 “Vitest가 Playwright spec까지 집어 실패”하는 문제는 해소됐다.

하지만 “다 끝났다”고 보긴 어렵다. 가장 중요한 남은 문제는 아래 둘이다.

1. semantic block 매칭이 일어나는 순간 exact structure가 다시 string field로 납작해진다.
2. 일부 매우 흔한 Python 구문이 아직도 legacy block 또는 text field로 강등된다.

즉 현재 상태는 다음처럼 정리하는 것이 정확하다.

> exact layer의 뼈대는 들어왔지만, semantic overlay와 몇몇 hot path가 아직 exactness를 다시 깨고 있다.

---

## 2. 이번에 실제로 좋아진 점

### 2.1 CPython AST 경로가 실질 canonical path가 됨

`src/utils/pyAst.js`는 이제 실제 CPython AST를 전제로 Python을 구조 블록으로 내린다. 주요 엔트리는 `pythonToBlocksViaAst()`이며, `src/App.jsx`와 `src/components/AIAgent.jsx` 모두 이 경로를 먼저 사용한다.

근거:

- `src/utils/pyAst.js:959-972`
- `src/App.jsx:120-136`
- `src/components/AIAgent.jsx:275-287`

의미:

- “어디서 Python을 넣었느냐에 따라 다른 변환기를 타는 문제”는 이전보다 많이 완화됐다.
- regex transpiler는 이제 primary path가 아니라 offline fallback 성격이 강해졌다.

### 2.2 exact block family가 실제로 생김

`src/blocks/exactPythonBlocks.js`에 다음과 같은 block family가 들어왔다.

- `py_attr`
- `py_subscript`
- `py_slice`
- `py_keyword_arg`
- `py_tuple`
- `py_list`
- `py_dict`
- `py_none`
- `py_bool`
- `py_fstring`
- `py_tuple_assign`
- `py_with`
- `py_try`
- `py_raise`

근거:

- `src/blocks/exactPythonBlocks.js:74-420`

의미:

- 예전처럼 `frame.shape`를 `var frame.shape` 같은 가짜 변수로 보여주거나,
- `ok, frame = cap.read()`를 아예 소실시키는 수준에서는 벗어났다.

### 2.3 backend span/source metadata가 추가됨

backend AST JSON에 `_id`, `_lineno`, `_end_lineno`, `_source`가 들어간다.

근거:

- `backend/main.py:279-307`

의미:

- 이후 exact IR, source-preserving fallback, UI span highlight 같은 기능으로 확장할 기반은 마련됐다.

### 2.4 degraded mode가 silent하지 않음

backend가 죽어 있을 때 AST exact path 대신 legacy transpiler를 쓰게 되는 사실이 UI에 노출된다.

근거:

- `src/App.jsx:648-661`

의미:

- 이전처럼 사용자가 “왜 갑자기 또 문자열 블록이 나오지?”를 원인 없이 겪는 문제는 줄어들었다.

### 2.5 unit test 실행 경로가 정상화됨

이전에는 `npm test -- --run`이 Playwright spec까지 함께 잡아서 실패했는데, 지금은 `package.json`의 `test`가 `vitest --dir src`로 바뀌었다.

근거:

- `package.json:11-13`

실행 결과:

```bash
npm test -- --run
```

결과:

- Test Files: 6 passed
- Tests: 81 passed

---

## 3. 남은 핵심 문제

아래는 현재 기준으로 중요한 순서대로 정리한 것이다.

## 3.1 [상] semantic library matching이 exact structure를 다시 문자열로 만든다

### 현상

semantic schema가 매칭되면 `librarySchemaRegistry.findSemanticCall()`이 block을 만들 때 `inputs`를 거의 쓰지 않고, 인자를 `fields`에 문자열로 밀어 넣는다.

구체적으로:

- constant는 그대로 field
- 그 외 expression은 `astToSource(arg)` 결과를 field
- keyword arg도 `astToSource(kw.value)` 결과를 field

근거:

- `src/utils/librarySchemaRegistry.js:128-146`

### 왜 문제인가

이 구조는 exact layer 위에 semantic block을 “덮는” 것이 아니라, semantic match가 되는 순간 nested structure를 버리는 것이다.

즉 아래처럼 된다.

- exact path에서는 `np.zeros((240,320,3), dtype=np.uint8)`가 tuple/attr/kwarg 구조를 가질 수 있음
- semantic schema가 `np.zeros`에 매칭되는 순간
- tuple, keyword arg, attr가 다시 text/string field가 됨

이건 현재 아키텍처 목표와 정면 충돌한다.

> semantic layer는 pretty view여야지, information-losing lowering이면 안 된다.

### 재현 예시

```python
np.zeros((240, 320, 3), dtype=np.uint8)
cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
```

이런 호출은 더 보기 좋은 semantic block으로 보일 수 있어도, 내부 표현은 여전히 stringly하다.

### 판정

이건 cosmetic issue가 아니라 architecture violation이다.

### 수정 방향

semantic schema를 아래처럼 바꿔야 한다.

- positional args는 `fields`가 아니라 `inputs`로 수용 가능해야 함
- keyword args도 `kwFields`가 아니라 `kwInputs` 또는 unified arg schema로 받아야 함
- semantic block generator는 exact sub-tree를 내부에 품어야 함

즉 필요한 것은:

- “semantic-looking exact block”
- 또는 “exact block subtree + semantic chrome”

이지, `astToSource()` flattening이 아니다.

---

## 3.2 [상] statement-position call은 아직 keyword arg를 문자열로 만든다

### 현상

expression position의 call은 `py_keyword_arg`를 써서 keyword arg 구조를 보존한다.

근거:

- `src/utils/pyAst.js:139-157`

하지만 statement position의 call은 여전히 아래처럼 처리된다.

```js
const kw = (v.keywords || []).map(k =>
  mkBlock('text', { fields: { TEXT: `${k.arg}=${astToSource(k.value)}` } })
);
```

근거:

- `src/utils/pyAst.js:545-557`

### 왜 문제인가

같은 Python call이라도 위치에 따라 exactness 정책이 달라진다.

예를 들어:

```python
foo(x=1)
a = foo(x=1)
```

두 코드가 서로 다른 fidelity를 가진 block tree로 변환된다.

이건 canonical IR 설계상 좋지 않다. 표현식인지 문장인지와 관계없이 call subtree의 구조는 동일해야 한다.

### 판정

이 문제는 semantic matching 이슈와 결합되면 더 악화된다. exact layer가 남긴 구조를 statement path에서 다시 텍스트로 바꾸고 있기 때문이다.

### 수정 방향

`py_stmt`도 `py_call`과 같은 인자 모델을 써야 한다.

즉:

- positional arg: value input
- keyword arg: `py_keyword_arg`
- starred / double-starred도 block으로 수용

처럼 통일하는 것이 맞다.

---

## 3.3 [중상] `for i in range(expr)`는 아직 legacy `repeat`로 강등된다

### 현상

AST visitor는 `for i in range(N)`를 special-case로 잡아서 기존 `repeat` block으로 변환한다.

근거:

- `src/utils/pyAst.js:608-616`

그런데 `repeat`는 여전히 `FieldNumber("TIMES")` 기반이다.

근거:

- `src/blocks/customBlocks.js:108-134`

### 왜 문제인가

이건 아래 같은 케이스를 정확하게 보존할 수 없다는 뜻이다.

```python
for i in range(n):
for i in range(x + 1):
for i in range(len(items)):
```

현재는 `astToSource(n)` 또는 문자열화된 표현식이 numeric field에 들어간다. 겉으로는 보일 수 있어도 구조적으로는 이미 깨진 상태다.

### 왜 더 중요하냐

`range(...)`는 Python 입문 코드에서 가장 흔한 패턴 중 하나다. 이 hot path가 exact하지 않으면 사용자 체감 품질이 계속 낮다.

### 수정 방향

둘 중 하나가 필요하다.

1. `repeat`를 exact-aware block으로 확장
   - `TIMES_VAL` input 추가
   - 기존 numeric field는 legacy fallback으로만 유지

2. 아예 `py_for_range` exact block을 별도로 도입
   - iterator variable
   - stop/start/step inputs
   - body

현재 목표가 exact-first라면 2번이 더 일관적이다.

---

## 3.4 [중상] 클래스는 아직 true exact representation이 아니다

### 현상

`ClassDef`는 아직 `structure_module_def`로 내려간다.

근거:

- `src/utils/pyAst.js:794-804`

그리고 base class 정보도 별도 구조가 아니라 `NAME` field에 문자열로 붙인다.

예:

```python
class C(Base):
```

가 사실상

```text
NAME = "C(Base)"
```

처럼 표현된다.

### 왜 문제인가

이건 최소한 “보여주기”는 되지만 exact class block은 아니다.

현재 손실되는 것:

- base class 리스트의 구조
- decorator / metaclass / keyword bases 같은 class header 구조
- class body와 function body의 semantic 차이
- OOP 전용 UI/roundtrip 확장 가능성

### 판정

이전 리뷰 때보다 좋아진 것은 맞지만, OOP를 canonical path에서 진짜 exact하게 받는 수준은 아니다.

### 수정 방향

최소한 아래가 필요하다.

- `py_classdef`
- base classes as inputs or dynamic slots
- decorators as separate exact structure
- body statement slot

현재 `structure_module_def`는 transitional fallback으로만 남는 것이 맞다.

---

## 3.5 [중] 일부 common construct는 아직 partial exactness 상태다

### 3.5.1 chained compare가 첫 비교만 남는다

근거:

- `src/utils/pyAst.js:253-262`

현재:

```python
a < b < c
```

는 사실상 첫 비교만 block으로 만든다.

이건 결과가 완전히 틀리는 건 아니더라도 구조 보존 관점에서는 명백히 불완전하다.

### 3.5.2 function signature가 여전히 text field다

근거:

- `src/utils/pyAst.js:771-791`
- `src/utils/pyAst.js:836-884`

현재 `py_funcdef`는 `ARGS`를 통째로 텍스트 필드로 들고 있다.

즉 다음 같은 구조는 아직 exact block tree가 아니다.

- positional-only args
- defaults
- kw-only args
- `*args`
- `**kwargs`
- annotations

### 3.5.3 `async for` / `async with`는 이름 필드에 `"async "`를 붙이는 식이다

근거:

- `src/utils/pyAst.js:713-746`

이건 임시 힌트로는 이해되지만 exact block 설계로 보기는 어렵다.

### 판정

이 문제들은 3.1~3.4보다 심각도는 낮지만, “exact layer가 완성됐다”는 표현을 쓰기에는 아직 이르다는 근거가 된다.

---

## 4. 이전 주요 문제 대비 현재 상태

## 4.1 해결되었거나 크게 좋아진 문제

### A. `py pass`로 무너지는 tuple assign

이전:

- `ok, frame = cap.read()`가 지원되지 않아서 사실상 정보가 사라짐

현재:

- `py_tuple_assign`로 구조 보존

근거:

- `src/utils/pyAst.js:447-477`
- `src/blocks/exactPythonBlocks.js:276-341`

### B. `frame.shape` 같은 attribute access가 가짜 변수처럼 보이던 문제

이전:

- `var frame.shape`처럼 보이는 UX

현재:

- `py_attr`로 nested structural lowering

근거:

- `src/utils/pyAst.js:121-130`
- `src/blocks/exactPythonBlocks.js:74-94`

### C. `None`이 문자열처럼 보이던 문제

현재:

- `py_none`

근거:

- `src/utils/pyAst.js:104-110`
- `src/blocks/exactPythonBlocks.js:216-224`

### D. degraded mode가 silent하던 문제

현재:

- 배너로 명시

근거:

- `src/App.jsx:648-661`

### E. Vitest / Playwright 충돌

현재:

- unit test 스크립트 분리 완료

근거:

- `package.json:11-13`

---

## 5. 테스트 상태

이번 리뷰에서 직접 확인한 것은 unit test까지다.

실행 명령:

```bash
npm test -- --run
```

실행 결과:

```text
Test Files  6 passed (6)
Tests       81 passed (81)
```

포함된 테스트:

- `src/utils/ast.test.js`
- `src/utils/blockToLibrary.test.js`
- `src/utils/libraryManager.test.js`
- `src/utils/transpiler.test.js`
- `src/utils/snippets.test.js`
- `src/blocks/customBlocks.test.js`

주의:

- 이번 재검토에서는 Playwright E2E는 다시 돌리지 않았다.
- 따라서 browser-level roundtrip UX와 screenshot-level semantic block 출력까지 “완전히 검증됨”이라고 말하긴 어렵다.

---

## 6. 구현 우선순위 제안

현재 상태에서 다음 순서로 고치는 것이 맞다.

## 6.1 1순위: semantic matcher를 exact-preserving하게 바꾸기

대상:

- `src/utils/librarySchemaRegistry.js`
- 필요시 semantic block 정의 파일들

목표:

- semantic match가 일어나도 nested structure를 버리지 않기
- `fields` 위주가 아니라 `inputs` 기반 semantic block을 지원하기

완료 기준:

- `np.zeros((240,320,3), dtype=np.uint8)`가 semantic block이어도 tuple/attr/kwarg subtree가 block으로 유지됨

## 6.2 2순위: statement call keyword args exact화

대상:

- `src/utils/pyAst.js`

목표:

- `py_stmt`와 `py_call`의 argument model 통일

완료 기준:

- statement/expression 위치 차이에 따라 kwargs fidelity가 달라지지 않음

## 6.3 3순위: `range(...)` canonical exact path 정리

대상:

- `src/utils/pyAst.js`
- `src/blocks/customBlocks.js`
- 또는 신규 `py_for_range`

목표:

- `repeat(FieldNumber)` 강등 제거

완료 기준:

- `range(n)`, `range(x+1)`, `range(len(xs))`가 전부 구조 블록으로 유지

## 6.4 4순위: `py_classdef` 도입

대상:

- `src/utils/pyAst.js`
- `src/blocks/exactPythonBlocks.js`

목표:

- class header, bases, body를 exact block으로 수용

완료 기준:

- `ClassDef`가 더 이상 `structure_module_def`에 의존하지 않음

## 6.5 5순위: partial exactness 항목들 마무리

대상:

- chained compare
- function signatures
- async blocks

완료 기준:

- exact block layer가 “예외 몇 개 남은 상태”가 아니라 실제로 일반 Python을 구조적으로 받는 수준에 가까워짐

---

## 7. 최종 판단

현재 상태를 한 문장으로 요약하면 이렇다.

> 이전의 “블록 모양에 문자열 넣기” 단계에서는 벗어났지만, semantic layer와 일부 legacy shortcut 때문에 아직 exact-first 아키텍처가 완결되지는 않았다.

더 직설적으로 말하면:

- “많이 고쳐졌다”는 평가는 맞다.
- “이제 다 됐다”는 평가는 아직 이르다.

남은 핵심 병목은 다음 두 줄로 압축된다.

1. semantic match 시 string flattening
2. class / range / statement kwargs 같은 hot path의 잔여 stringly lowering

이 둘을 정리하면 그때부터는 정말로 “모든 라이브러리를 exact layer로 받고, LLM은 위에서 추상화만 하는 구조”에 가까워진다.

