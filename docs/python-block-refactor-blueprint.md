# Python Exact Blockification Refactor Blueprint

## 문서 목적

이 문서는 현재 코드베이스의 `Python -> Blocks` 변환 계층을 전면 재설계하기 위한 실행 청사진이다.

핵심 목표는 다음 두 가지다.

1. 모든 Python 문법과 모든 라이브러리 코드를 손실 없이 받아들이는 `정확 보존 레이어`를 먼저 구축한다.
2. 그 위에서만 LLM이 `불필요한 저수준을 접고 추상화`하는 보조 역할을 수행하게 만든다.

이 문서는 다른 에이전트가 바로 구현 작업을 분할하고 착수할 수 있도록 아래 내용을 포함한다.

- 현재 핵심 문제 정의
- 목표 아키텍처
- 파일별 리팩터링 계획
- 단계별 실행 플랜
- 완료 기준
- 핵심 문제를 드러내는 테스트케이스 목록

---

## 한 줄 요약

현재 구조는 `정확한 Python 파싱`과 `예쁜 블록 추상화`가 뒤섞여 있어서, coverage가 낮은 부분이 `블록 모양의 문자열 상자`로 무너진다.

정답 구조는 다음 순서다.

`CPython AST -> Exact IR -> Exact Blockly -> Semantic Library Blocks -> LLM Abstraction`

즉:

- 파싱과 의미 보존은 컴파일러/인터프리터 계층 책임
- 블록 추상화는 semantic layer 책임
- LLM은 마지막에만 접기/fold/summarize 역할

---

## 현재 핵심 문제

### 1. 정확 레이어와 추상화 레이어가 섞여 있다

현재 `src/utils/pyAst.js`는 아래 책임을 한 파일에 동시에 가지고 있다.

- CPython AST 입력 해석
- Exact-ish block lowering
- Semantic library block 매칭
- Generic fallback
- Source reconstruction fallback

이 구조에서는 unsupported syntax가 어디서 손실되는지 추적하기 어렵다.

### 2. unsupported syntax가 보존되지 않는다

예:

- `ok, frame = cap.read()`
- `try / except / finally`
- `with ... as ...`
- generic `for x in items`

이런 케이스는 exact block으로 내려가지 못하고 `raw_python`, placeholder, 또는 사실상 `pass` 수준으로 붕괴될 수 있다.

### 3. semantic block coverage가 너무 낮다

`cv2.VideoCapture`, `np.zeros` 같은 일부만 예쁘게 나오고 나머지는 여전히 generic `py_call` / `py_stmt`에 의존한다.

즉 지금 화면은 다음이 혼합된 상태다.

- 진짜 의미 블록
- exact-ish generic block
- legacy string block

이 세 종류가 섞이면 사용자 입장에서 일관된 블록 언어로 보이지 않는다.

### 4. legacy block family와 exact block family가 동시에 살아 있다

현재 코드베이스에는 아래가 동시에 존재한다.

- `variable`, `change_variable`, `if`, `repeat_until` 같은 legacy string field block
- `py_call`, `py_stmt`, `py_binop`, `py_assign`, `raw_python` 같은 exact-ish block
- 일부 semantic library block

이 상태에서는 변환 경로에 따라 결과 모양이 달라진다.

### 5. LLM의 역할이 아직도 잘못 정의되어 있다

LLM은 지금도 부분적으로 `깨지지 않는 Python 소스 생성기`처럼 취급되고 있다.

원하는 구조에서는 LLM이 하면 안 되는 일:

- 소스 파싱
- exact blockification
- roundtrip 정합성 책임

LLM이 해야 하는 일:

- abstraction candidate 제안
- boilerplate folding
- semantic grouping
- block cluster naming

---

## 목표 아키텍처

### Layer 1. Parse Layer

입력 Python을 CPython AST로 안정적으로 얻는다.

요구사항:

- `lineno`, `col_offset`, `end_lineno`, `end_col_offset`
- `sourceText` 보존
- import alias 보존
- decorators, type hints, keyword args 보존

출력 예시:

```js
{
  source: "...",
  ast: { _kind: "Module", body: [...] },
  spans: {
    "node_1": {
      startLine: 1,
      startCol: 0,
      endLine: 1,
      endCol: 12,
      sourceText: "x = 1"
    }
  }
}
```

### Layer 2. Exact IR Layer

CPython AST를 Blockly와 독립적인 내부 IR로 정규화한다.

이 레이어의 목표:

- 모든 Python 문장을 손실 없이 표현
- source-equivalent Python 재생성 가능
- semantic block이 없어도 정보 보존 가능

예시:

```js
{
  kind: "Assign",
  targets: [
    { kind: "TuplePattern", items: [...] }
  ],
  value: { kind: "CallExpr", callee: ..., args: ... }
}
```

### Layer 3. Exact Blockly Layer

Exact IR를 Blockly block tree로 1:1 투영한다.

이 레이어의 목표:

- 보기 좋지 않아도 상관없다
- 대신 절대로 구조를 문자열로 잃으면 안 된다

예:

- attr access -> `py_attr`
- tuple -> `py_tuple`
- keyword arg -> `py_keyword`
- tuple assignment -> `py_tuple_assign`
- with -> `py_with`
- try -> `py_try`

### Layer 4. Semantic Library Layer

Exact block 위에 library metadata를 기반으로 semantic block을 덮어쓴다.

예:

- `cv2.VideoCapture(0)` -> `cv2_video_capture`
- `cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)` -> `cv2_cvtcolor_gray`
- `np.zeros((240, 320, 3), dtype=np.uint8)` -> `np_zeros_with_dtype`

조건:

- semantic lowering에 실패해도 exact block으로 돌아갈 수 있어야 한다
- semantic block은 exact meaning을 덮어쓰는 view이지 canonical representation이 아니다

### Layer 5. LLM Abstraction Layer

LLM은 semantic/exact block graph를 입력으로 받아 일부를 접는다.

예:

- `cap.read() -> if not ok -> zeros(...)`를
  `웹캠 또는 테스트이미지 가져오기` 블록으로 fold 제안

중요:

- LLM은 source generator가 아니다
- LLM 결과는 항상 취소 가능해야 한다
- exact block graph는 항상 보존돼야 한다

---

## 설계 원칙

1. `정확 보존`이 `예쁜 시각화`보다 우선이다.
2. unsupported syntax는 절대 `pass`나 `comment`로 낮추지 않는다.
3. semantic block으로 못 내리면 exact block으로 내려라.
4. exact block으로도 표현 못 하면 `raw_python`에 verbatim source를 넣어라.
5. LLM이 없어도 Python -> Blocks 품질은 유지돼야 한다.
6. 같은 Python은 어느 진입 경로로 들어와도 같은 exact blocks가 나와야 한다.
7. roundtrip 테스트 없이 lowering 규칙을 추가하지 않는다.

---

## 목표 파일 구조

```text
src/
  ir/
    pythonAstClient.js
    cpythonAstToExactIr.js
    exactIrTypes.js
    exactIrToPython.js
    exactIrToBlockly.js
    blocklyToExactIr.js
    semanticMatcher.js
    abstractionPlan.js
  blocks/
    scratchBlocks.js
    exactPythonBlocks.js
    semanticLibraryBlocks.js
  libraries/
    librarySchemaRegistry.js
    schemaNormalizer.js
    builtinSemanticSchemas.js
  components/
    AbstractionPanel.jsx
    ExactBlockInspector.jsx
    SemanticToggle.jsx

backend/
  ast_api.py
  library_introspection.py
  schema_builder.py
```

---

## 파일별 리팩터링 계획

### A. `backend/main.py`

#### 현재 문제

- `/ast`가 AST JSON은 주지만 exact source-preserving에 필요한 메타데이터가 부족하다.
- library introspection API가 없다.

#### 해야 할 일

1. `/ast` 응답에 아래 정보 추가
   - `end_lineno`
   - `end_col_offset`
   - `node_id`
   - `sourceText`
2. `ast.get_source_segment()` 기반 source extraction 도입
3. `/introspect/library` 엔드포인트 추가
4. `/schema/library` 엔드포인트 추가

#### 완료 기준

- tuple assign, with, try, decorated function도 source span을 잃지 않는다
- 특정 라이브러리 symbol 시그니처 조회 가능

#### 산출물

- `backend/tests/test_ast_api.py`
- `backend/tests/test_library_introspection.py`

---

### B. `src/utils/pyAst.js`

#### 현재 문제

- 책임이 과도하게 많다
- exact lowering과 semantic matching과 fallback이 섞여 있다
- class/function lowering이 정확하지 않다

#### 해야 할 일

이 파일을 단계적으로 해체한다.

추천 분리:

- `src/ir/pythonAstClient.js`
- `src/ir/cpythonAstToExactIr.js`
- `src/ir/exactIrToBlockly.js`
- `src/ir/exactIrToPython.js`
- `src/ir/semanticMatcher.js`

#### 구체 작업

1. `astToSource()`를 canonical source regeneration에서 제거
2. `Assign`에서 tuple target, multi-target, nested target 지원
3. `ClassDef`를 `structure_module_def`로 내리는 현재 로직 제거
4. `Attribute`, `Subscript`, `KeywordArg`, `Call chain`, `Slice`, `Dict`, `Set`, `Comprehension` exact lowering 추가
5. unsupported statement는 `raw_python`에 verbatim source 유지

#### 완료 기준

- `ok, frame = cap.read()`가 더 이상 `py pass`로 안 나온다
- `frame.shape`, `gray.mean()`, `buf.tobytes().decode()`가 구조 블록으로 유지된다

---

### C. `src/blocks/customBlocks.js`

#### 현재 문제

- legacy block, exact block, semantic block이 한 파일에 뒤섞여 있다

#### 해야 할 일

파일 분리:

- `src/blocks/scratchBlocks.js`
- `src/blocks/exactPythonBlocks.js`
- `src/blocks/semanticLibraryBlocks.js`

#### Exact block family 추가 대상

- `py_name`
- `py_literal_number`
- `py_literal_string`
- `py_literal_bool`
- `py_literal_none`
- `py_attr`
- `py_subscript`
- `py_tuple`
- `py_list`
- `py_dict`
- `py_keyword`
- `py_call_expr`
- `py_call_stmt`
- `py_assign`
- `py_tuple_assign`
- `py_augassign`
- `py_if`
- `py_while`
- `py_for`
- `py_try`
- `py_with`
- `py_raise`
- `py_return`
- `py_import`
- `py_import_from`
- `py_funcdef`
- `py_classdef`
- `py_raw_stmt`

#### 구현 규칙

- dynamic arity block에는 mutator/extraState serializer 추가
- exact blocks는 value input 중심이어야 한다
- `FieldTextInput`은 literal/text/name 같은 최소 단위에만 허용

#### 완료 기준

- exact block family만으로 unsupported library code도 구조 보존 가능

---

### D. `src/utils/libraryManager.js`

#### 현재 문제

- `reversePatterns` 기반 단순 regex/arity 매칭
- chain call, keyword arg, receiver-aware matching 불가

#### 해야 할 일

`LibrarySchemaRegistry` 기반으로 재설계한다.

새 schema 예시:

```js
{
  module: "cv2",
  symbols: [
    {
      path: "cv2.VideoCapture",
      kind: "callable",
      signatures: [
        { positional: ["source"], keywords: [] }
      ],
      semanticBlockType: "cv2_video_capture",
      exactFallback: "py_call_expr"
    }
  ]
}
```

#### 세부 작업

1. 설치/복원 로직과 matching 로직 분리
2. `_libLookup(callee, arity)` 제거
3. matching 기준 확장
   - call path
   - receiver path
   - keyword set
   - argument kinds
   - chain context
4. library block schema normalization 도입

#### 완료 기준

- `cv2.COLOR_BGR2GRAY`, `cap.read`, `df.to_excel(index=False)` 같은 케이스도 library-aware matching 가능

---

### E. `src/utils/snippetLibraries.js`

#### 현재 문제

- hand-authored semantic block 팩
- canonical path가 되면 안 되는 임시 우회로

#### 해야 할 일

이 파일은 다음 역할로 축소한다.

- demo fixture
- curated semantic pack
- schema generation 실패 시 fallback pack

#### 유지 가능한 것

- OpenCV/Numpy/Pandas/Requests/Streamlit curated packs

#### 제거해야 하는 오해

- "semantic pack 몇 개 더 만들면 전체 문제가 해결된다"

#### 완료 기준

- `snippetLibraries`는 데모/fixture 역할만 하고, exact blockification 품질은 여기에 의존하지 않는다

---

### F. `src/components/AIAgent.jsx`

#### 현재 문제

- 여전히 `load_python` 중심
- prompt가 legacy DSL 기준
- LLM이 parser 대용처럼 취급된다

#### 해야 할 일

tool 역할 재설계:

- `propose_abstraction`
- `apply_abstraction`
- `generate_library_schema`
- `explain_block_group`
- `fold_boilerplate_region`

#### prompt 수정 규칙

삭제해야 할 것:

- `import time만 허용`
- `f-string 금지`
- `유저 함수 호출 금지`
- `print 금지`

추가해야 할 것:

- 입력은 Python source 또는 exact block graph 요약
- 출력은 abstraction candidates 또는 schema suggestion

#### 완료 기준

- LLM이 없어도 exact blockification은 유지
- LLM은 "표현 방식 개선"만 담당

---

### G. `src/App.jsx`

#### 현재 문제

- canonical path가 명확하지 않다
- backend offline 시 degraded mode가 명시적이지 않다
- semantic/exact view 개념이 없다

#### 해야 할 일

1. canonical pipeline 고정

```text
Python
  -> Parse Layer
  -> Exact IR
  -> Exact Blocks
  -> Optional Semantic Overlay
```

2. snapshot 레이어 분리
   - `pythonRawRef`
   - `exactIrSnapshotRef`
   - `workspaceSnapshotRef`

3. degraded mode 표시
   - backend offline 시 silent regex fallback 금지
   - 사용자에게 exact mode unavailable 표시

4. 보기 모드 추가
   - Exact Blocks
   - Semantic Blocks
   - Python

#### 완료 기준

- AI load / snippet load / manual toggle 모두 동일한 exact blocks 생성

---

## 단계별 실행 계획

### Phase 0. Baseline Freeze

#### 목표

현재 실패를 모두 고정 fixture로 만든다.

#### 작업

1. Python fixtures 수집
2. golden snapshot 저장
3. `vitest`와 `playwright` 스크립트 분리

#### 완료 기준

- 현재 스크린샷형 실패를 재현하는 fixture 존재

---

### Phase 1. Exact IR 도입

#### 목표

Blockly와 분리된 exact Python IR 확보

#### 작업

1. `cpythonAstToExactIr` 구현
2. `exactIrToPython` 구현
3. source span 보존
4. tuple assign / keyword arg / attr / subscript / class / try / with 지원

#### 완료 기준

- `Python -> ExactIR -> Python`이 source-equivalent

---

### Phase 2. Exact Blockly Layer

#### 목표

Exact IR를 손실 없이 block tree로 내린다.

#### 작업

1. exact block family 구현
2. mutator / extraState serializer 추가
3. exact lowering 구현

#### 완료 기준

- unsupported syntax가 generic exact block으로는 표현된다
- 문자열 필드로 구조를 잃지 않는다

---

### Phase 3. Semantic Library Layer

#### 목표

Exact block 위에 의미 블록 덮어쓰기

#### 작업

1. library schema registry
2. semantic matcher
3. OpenCV/Numpy/Pandas/Requests/Streamlit curated schema

#### 완료 기준

- 대표 라이브러리 관용구가 의미 블록으로 보인다

---

### Phase 4. LLM Abstraction Layer

#### 목표

LLM을 fold/summarize/propose 역할로 한정

#### 작업

1. abstraction candidate format 설계
2. block fold UI
3. undo/redo
4. confidence threshold

#### 완료 기준

- LLM이 parse/lower에 직접 관여하지 않는다

---

### Phase 5. Cleanup

#### 목표

중복 경로 제거

#### 작업

1. `transpiler.js` legacy fallback 격리
2. `ast.js` 실험 코드 제거 또는 archive
3. snippet manual path 축소

#### 완료 기준

- single canonical path only

---

## 다른 에이전트에게 줄 구현 규칙

1. unsupported syntax를 절대 `pass`로 낮추지 마라.
2. semantic block으로 못 내리면 exact block으로 내려라.
3. exact block으로도 못 내리면 `raw_python`에 verbatim source를 넣어라.
4. source-preserving 테스트 없이는 lowering 규칙을 추가하지 마라.
5. UI가 ugly해져도 정보 손실보다 낫다.
6. LLM은 parser가 아니다.
7. 같은 Python은 어느 입력 경로에서도 같은 exact block graph를 만들어야 한다.

---

## 테스트 전략

테스트는 아래 6층으로 구성한다.

1. Parser/API
2. Exact IR
3. Exact Blockly lowering
4. Semantic library matching
5. LLM abstraction safety
6. E2E roundtrip

---

## 핵심 문제를 드러내는 테스트케이스

### A. Exact Preservation Tests

| ID | 입력 | 목적 | 기대 결과 |
|---|---|---|---|
| EP-01 | `x = 1` | 기본 대입 | exact assign block 생성, roundtrip 동일 |
| EP-02 | `x += 2` | 증감 대입 | target/op/value 구조 유지 |
| EP-03 | `ok, frame = cap.read()` | tuple assign | 절대 `pass` 금지, tuple assign exact block 생성 |
| EP-04 | `a = b = 0` | multi-target assign | target 2개 모두 보존 |
| EP-05 | `frame.shape` | attr access | 문자열 var가 아니라 attr structure |
| EP-06 | `posts[0]` | subscript | container/slice 구조 유지 |
| EP-07 | `arr[1:5:2]` | slice | lower/upper/step 구조 유지 |
| EP-08 | `foo(x=1, y=2)` | keyword arg | positional/keyword 구분 유지 |
| EP-09 | `f"{x}"` | f-string | JoinedStr/FormattedValue 보존 |
| EP-10 | `None` | none literal | 문자열 `"None"`이 아니라 none literal block |

### B. Control Flow Tests

| ID | 입력 | 목적 | 기대 결과 |
|---|---|---|---|
| CF-01 | `if x > 0:` | 단순 if | condition value-block 유지 |
| CF-02 | `if a < b < c:` | chained compare | chain compare 정보 손실 금지 |
| CF-03 | `while cond:` | while | exact while 보존 |
| CF-04 | `for i in range(n):` | range variable | 숫자 field 강등 금지 |
| CF-05 | `for x in items:` | generic for | placeholder 금지, exact for 유지 |
| CF-06 | `try: ... except ... finally ...` | 예외 처리 | `pass` 붕괴 금지 |
| CF-07 | `with open(...) as f:` | context manager | with exact block |
| CF-08 | `break / continue` | loop control | roundtrip 동일 |

### C. Function / Class Tests

| ID | 입력 | 목적 | 기대 결과 |
|---|---|---|---|
| FC-01 | `def f(x): return x+1` | 함수 정의 | exact function block |
| FC-02 | `class C: def m(self): ...` | 클래스/메서드 | module block 오인 금지 |
| FC-03 | `class C(Base): ...` | 상속 | base 유지 |
| FC-04 | decorator 함수 | decorator 보존 | drop 금지 |
| FC-05 | annotation 포함 함수 | 타입힌트 보존 | flatten 금지 |

### D. Library Semantic Matching Tests

| ID | 입력 | 목적 | 기대 결과 |
|---|---|---|---|
| LS-01 | `cv2.VideoCapture(0)` | semantic OpenCV value block | `cv2_video_capture` |
| LS-02 | `cap.read()` | instance method semantic block | `cv2_cap_read` 또는 exact method-call |
| LS-03 | `cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)` | semantic color conversion | `cv2_cvtcolor_gray` |
| LS-04 | `np.zeros((240,320,3), dtype=np.uint8)` | tuple arg + kw arg | semantic block 또는 exact kw block |
| LS-05 | `base64.b64encode(buf.tobytes()).decode()` | chain call | chain 구조 유지 |
| LS-06 | `requests.get(url).json()` | chain method | exact chain or semantic pair |
| LS-07 | `df.to_excel(path, index=False)` | keyword arg statement | kw preserve |
| LS-08 | `st.slider("n", 0, 10, 3)` | streamlit widget | semantic block |

### E. Regression Tests for Current Failures

| ID | 입력 | 현재 문제 | 기대 결과 |
|---|---|---|---|
| RG-01 | `ok, frame = cap.read()` | `py pass` | exact tuple assign |
| RG-02 | `frame.shape` | `var frame.shape` | attr block |
| RG-03 | `cv2.COLOR_BGR2GRAY` | pseudo variable | attr/enum block |
| RG-04 | `gray.mean()` | generic wrapper | method chain preserved |
| RG-05 | `np.zeros(..., dtype=np.uint8)` | `"dtype=..."` text | keyword arg block |
| RG-06 | backend offline | silent degraded mode | explicit degraded mode |
| RG-07 | AI load vs manual toggle | 결과 다름 | same canonical exact output |

### F. Roundtrip Invariants

| ID | 흐름 | 목적 | 기대 결과 |
|---|---|---|---|
| RT-01 | `Python -> ExactIR -> Python` | source-equivalent | semantic equality |
| RT-02 | `Python -> Blocks -> Python` | no-touch lossless | byte-identical 또는 normalized-equal |
| RT-03 | `Python -> Semantic Blocks -> Python` | abstraction safety | behavior preserved |
| RT-04 | `Blocks edit -> Python -> Blocks` | canonical stability | shape drift 최소화 |
| RT-05 | import ordering | import 위치 보존 | reorder 금지 |

### G. LLM Abstraction Safety Tests

| ID | 입력 | 목적 | 기대 결과 |
|---|---|---|---|
| LA-01 | webcam fallback boilerplate | fold suggestion | source untouched, fold metadata만 생성 |
| LA-02 | semantic collapse risk | 의미 손실 방지 | reject 또는 confirm 요구 |
| LA-03 | abstraction undo | reversible UI | exact block restored |
| LA-04 | unknown library | hallucination 방지 | exact blocks 유지 |

---

## 테스트 구현 우선순위

가장 먼저 추가할 테스트:

1. `RG-01` tuple assign
2. `RG-02` attr access
3. `RG-05` keyword arg preservation
4. `CF-06` try/except/finally
5. `FC-02` class/method lowering
6. `RT-02` no-touch lossless roundtrip
7. `RG-07` AI path/manual path equivalence
8. `LA-01` abstraction proposal safety

이 순서인 이유:

- 현재 사용자 체감 문제를 가장 직접적으로 드러낸다
- screenshot 수준 실패를 바로 잡을 수 있다
- semantic/LLM 레이어 이전에 exact layer를 안정화한다

---

## 추천 테스트 파일 배치

```text
src/ir/
  cpythonAstToExactIr.test.js
  exactIrToPython.test.js
  exactIrToBlockly.test.js
  semanticMatcher.test.js

tests/e2e/
  exact_roundtrip.spec.js
  library_semantic_blocks.spec.js
  degradation_mode.spec.js
  abstraction_layer.spec.js
```

추천 fixture 파일:

```text
tests/fixtures/python/
  tuple_assign.py
  attr_chain.py
  cv2_webcam_pipeline.py
  numpy_keyword_args.py
  pandas_excel_flow.py
  requests_chain.py
  class_methods.py
  try_with_raise.py
```

---

## 완료 판정 기준

아래가 모두 만족돼야 "됐다"고 판단한다.

1. `ok, frame = cap.read()`가 더 이상 `py pass`로 나오지 않는다.
2. `frame.shape`, `gray.mean()`, `buf.tobytes().decode()`가 문자열 묶음이 아니라 구조 블록으로 보인다.
3. semantic block이 없는 라이브러리도 exact block으로는 100% 보존된다.
4. backend offline일 때 사용자는 degraded mode임을 명확히 안다.
5. 같은 Python을 AI load, snippet load, mode toggle로 넣어도 같은 exact block graph가 나온다.
6. LLM을 꺼도 blockification 품질이 유지된다.
7. LLM은 abstraction proposal에만 개입한다.

---

## 첫 스프린트 작업지시서

### Sprint 1 목표

`Exact preservation` 기반을 만든다.

### 작업 항목

1. `backend/main.py`
   - source span, end span, node id, sourceText 추가
2. `src/utils/pyAst.js`
   - tuple assign exact lowering
   - attr exact lowering
   - keyword arg exact lowering
   - class lowering 수정
3. `src/blocks/customBlocks.js`
   - exact block family 파일 분리 시작
4. `src/components/AIAgent.jsx`
   - legacy DSL 제한 제거 계획 반영
5. 테스트 추가
   - `RG-01`
   - `RG-02`
   - `RG-05`
   - `FC-02`
   - `RT-02`
   - `RG-07`

### Sprint 1 완료 기준

- screenshot에 보이는 대표 붕괴 케이스가 exact block으로 보존된다
- AI/manual/toggle 경로에서 결과 차이가 줄어든다

---

## 지금 버려야 할 잘못된 접근

1. semantic block 몇 개 더 만들면 해결된다는 생각
2. prompt tuning으로 해결할 수 있다는 생각
3. generic `py_call`도 블록이니까 괜찮다는 생각

위 세 가지는 전부 임시 처방이다.

핵심은 항상 동일하다.

`exact layer first, semantic layer second, LLM last`

---

## 실행 상태 (진행 중 기록)

아래는 Sprint 1 단위로 실제 반영된 변경점과 다음에 건드려야 하는 작업을 한 곳에 기록하는 섹션이다.
체크가 들어 있으면 구현 및 테스트 완료, 빈 박스는 계속 남은 작업이다.

### Sprint 1 — Exact Preservation 기반 (완료)

구현 및 테스트가 모두 통과한 항목:

- [x] `backend/main.py` `/ast` 응답에 `_id`, `_end_lineno`, `_end_col`, `_source` 추가. `ast.get_source_segment`로 노드별 source slice 노출. (`backend/main.py`)
- [x] `backend/main.py` `/introspect` 엔드포인트: Python `inspect`로 설치된 모든 모듈의 시그니처/독스트링/kind 열거. Layer 2의 실제 진입점.
- [x] `src/blocks/exactPythonBlocks.js` 신규 파일: exact IR용 블록군 분리. 등록 블록 `py_attr`, `py_subscript`, `py_slice`, `py_keyword_arg`, `py_tuple`, `py_list`, `py_dict`, `py_none`, `py_bool`, `py_fstring`, `py_tuple_assign`, `py_with`, `py_try`, `py_raise`, `py_for_iter`.
- [x] `src/utils/pyAst.js` 재설계: tuple assign → `py_tuple_assign` (더 이상 `py pass`가 아니다), attribute → `py_attr`, subscript → `py_subscript`, slice → `py_slice`, list/tuple/dict → 구조 블록, f-string → `py_fstring`, None/Bool → 전용 literal 블록, keyword arg → `py_keyword_arg`, `with` → `py_with`, `try` → `py_try`, `raise` → `py_raise`, `for x in iter` → `py_for_iter`.
- [x] `src/utils/libraryIntrospector.js` 신규 파일: `/introspect` 결과를 Blockly 라이브러리 팩으로 자동 합성하는 Layer 2→3 브리지.
- [x] `src/components/PythonSnippets.jsx`가 스니펫 로드 시 `installLibraryFromIntrospection`을 호출해 설치된 모든 모듈에 대해 toolbox block 자동 생성.
- [x] `package.json` test script 분리 (`test` / `test:unit` → `vitest --dir src`, `test:e2e` → `playwright test`).
- [x] E2E 검증: `tests/e2e/exact_preservation.spec.js` 에서 `RG-01 ~ RG-07`, `CF-06`, `CF-07`, `FC-02`, `RT-02`, `EP-06`, `EP-10` 모두 통과 (10/10). 이 중 `RG-01`은 "tuple assign이 더 이상 pass로 붕괴되지 않음"을 직접 어설션한다.

이 시점의 회귀 테스트 현황: Playwright E2E 67/67 통과, Vitest 81/81 통과.

### Sprint 2 — Exact IR 확장 (완료)

`tests/e2e/sprint2_exact_coverage.spec.js`의 S2-01 ~ S2-12 모두 초록.

- [x] `Lambda` → `py_lambda` value block (`src/blocks/exactPythonBlocks.js`, `src/utils/pyAst.js`).
- [x] `ListComp` / `SetComp` / `GeneratorExp` → `py_comprehension` (드롭다운으로 리스트/세트/제너레이터 선택).
- [x] `DictComp` → `py_dict_comp`.
- [x] `Yield` / `YieldFrom` → `py_yield`. Expr-level yield도 statement로 내림.
- [x] `Await` → `py_await` value block. Expr-level await는 py_stmt로 래핑.
- [x] `Assert` → `py_assert`, `Delete` → `py_delete` (각 target 별 블록 체인).
- [x] `Global` / `Nonlocal` → `py_scope`.
- [x] `Match` / `match_case` → `py_match` + `py_case` (Python 3.10+ 패턴 매칭).
- [x] `AsyncFor` / `AsyncWith` → 기존 `py_for_iter` / `py_with`에 "async" 힌트 필드. `AsyncFunctionDef` → `py_funcdef`의 KIND=`async def`.
- [x] `Return` → `py_return` (value input 트리를 받는 exact 블록). `structure_return_typed`의 math_number 제약 제거.
- [x] `FunctionDef` → `py_funcdef` (decorator, 타입 어노테이션, 다양한 arg kind를 렌더하는 `_renderArgs` 헬퍼 포함).
- [x] `ClassDef`는 base class를 NAME 필드에 `ClassName(Base1, Base2)` 형식으로 보존.

### Sprint 3 — Semantic Library Layer 재설계 (완료)

`tests/e2e/sprint3_schema_registry.spec.js`의 S3-01 ~ S3-04 모두 초록.

- [x] `src/utils/librarySchemaRegistry.js` 신규 파일: `callPath`, `arity`, `keywords`, `allowExtraKw`, `kwFields` 기반 스키마 매칭 엔진. 점수 함수(`_scoreMatch`)로 후보 중 가장 잘 맞는 스키마 선택.
- [x] 레거시 `reversePatterns`는 `_schemaFromReverse` 어댑터를 통해 자동으로 새 스키마 포맷으로 변환 — 기존 라이브러리 팩은 깨지지 않음.
- [x] 새 라이브러리 팩은 `pkg.schemas`를 직접 선언 가능 (receiver-aware matching 여지 확보).
- [x] `pyAst.js` 가 `findSemanticCall(callee, kwNames, arity, ...)`으로 registry를 조회. 매칭 실패 시 자연스럽게 exact block(py_call/py_stmt)으로 내려감 = 명시적 downgrade 정책.
- [x] `libraryManager.installLibrary` / `uninstallLibrary` 에서 `invalidateSchemaRegistry()` 호출 — 라이브러리 설치 즉시 새 스키마가 파서에 반영됨 (페이지 reload 불필요).
- [x] `snippetLibraries.js`는 여전히 사용되지만 canonical 경로 아님. 스니펫 로드는 `installLibraryFromIntrospection`을 함께 호출해 exact block family + schema registry를 같이 채움.

### Sprint 4 — LLM을 abstraction-only로 한정 (완료)

`tests/e2e/sprint4_llm_role.spec.js`의 S4-01 ~ S4-04 모두 초록.

- [x] `AIAgent.jsx` system prompt에서 `f-string 금지 / import time만 허용 / String concatenation with + 금지 / print() 금지` 등 레거시 DSL 제약 전부 삭제. 새 프롬프트는 "CPython-AST 파이프라인이 정확 블록화를 처리한다; 너는 abstraction 레이어"로 재정의.
- [x] 새 tool 추가:
  - `propose_abstraction` — 현재 workspace를 읽어 fold 후보를 LLM이 제안. 실제 적용은 하지 않음.
  - `explain_block_group` — 블록 클러스터가 하는 일을 자연어로 서술.
- [x] `load_python`의 description이 "sprite.* API"에서 "Any library, any syntax — no DSL restrictions"로 변경됨.
- [x] `executeTool`에 두 신규 tool handler 연결. `propose_abstraction`은 `window.__blocklyWorkspace.getAllBlocks()`를 스냅샷으로 반환.

### Sprint 5 — Cleanup + 단일 진입 경로 (완료)

`tests/e2e/sprint5_cleanup.spec.js`의 S5-01 ~ S5-04 모두 초록.

- [x] `src/utils/transpiler.js` → `src/utils/legacy/transpiler.js` 이동. `src/utils/ast.js` → `src/utils/legacy/ast.js` 이동. `App.jsx` / `AIAgent.jsx` import 경로도 `legacy/`로 갱신. 레거시는 backend 오프라인 fallback으로만 사용.
- [x] `tests/e2e/sprint5_cleanup.spec.js` S5-02 — grep으로 "`/src/utils/transpiler`" 직접 import가 production code에 남아있으면 실패. 회귀 방지 gate.
- [x] `App.jsx`에 degraded-mode banner 추가. `pythonBackendHealth.ok === false` 일 때 `data-testid="degraded-mode-banner"` 가 렌더됨. 10초마다 `/health` 재조회 → 백엔드 복구 시 자동으로 사라짐.
- [x] S5-04 — `page.route('http://127.0.0.1:8000/**', r => r.abort())` 로 백엔드 차단한 컨텍스트에서 banner가 보이는지 직접 확인.
- [ ] 3-way view toggle (Exact / Semantic / Python)는 아직 추가하지 않음 — 현재는 Blocks ↔ Python 이원 토글. (사용자가 실질적으로 보는 블록은 이미 exact + semantic 혼합이라 view toggle 필요성이 낮다고 판단. 향후 스프린트 여분으로 남김.)
- [ ] `snippetBlocks.js` 수동 workspace JSON 경로는 아직 남아있음. Sprint 3가 exact IR 기반으로 충분한 커버리지를 확보하면 제거 가능. 현재는 스니펫이 exact IR 경로와 공존.

### 현재 테스트 현황 (Sprint 5 완료 시점)

- Playwright E2E: **91 / 91** 초록 (roundtrip 16, feature 15, python_backend 12, snippets 6, ast_roundtrip 8, exact_preservation 10, sprint2 12, sprint3 4, sprint4 4, sprint5 4).
- Vitest unit: **81 / 81** 초록.
- 합계 **172개 초록 테스트**가 모든 스프린트의 회귀를 감시함.

### Sprint 6 — stringly fallback 봉쇄 + 전 문법 커버리지 (완료)

`tests/e2e/grand_python_coverage.spec.js`의 GP-01 (단일 거대 fixture가 30+ Python 노드 종류를 커버)이 초록. 이 테스트는 **모든 지원 문법이 structural block으로 lower되며 raw_python으로 떨어진 건 `break` / `continue` 키워드뿐**임을 강제한다.

이번 스프린트에서 막아낸 stringly 케이스:

- [x] **schema scoring 강화** (`src/utils/librarySchemaRegistry.js`):
  - 인자 중에 `Tuple` / `List` / `Dict` / `Call` / `Subscript` 등 structural 노드가 있으면 schema 점수에서 60점씩 차감 → field-only 라이브러리 블록에 stringify 되는 일이 사라짐.
  - 매핑되지 않은 kwarg 1개당 -50점 → `np.zeros(..., dtype=np.uint8)`처럼 schema가 모르는 kwarg 가 있을 때 자연스럽게 py_call로 떨어짐.
  - 최종 점수가 양수일 때만 schema 매칭 — 음수면 honest fallback 우선.
- [x] **method chain (`base64.b64encode(buf.tobytes()).decode()`)**: callee가 Call일 때 `flattenAttrName` 실패 → 이전엔 callee 전체를 `astToSource`로 stringify해 FUNC text field에 박았음. 이제 `py_call`에 **CALLEE value-input** 슬롯이 있고 visitor는 chain callee를 `exprBlock`으로 lower해 그 슬롯에 꽂는다 — 체인 구조가 블록 트리로 보존됨.
- [x] **Subscript LHS 대입** (`frame[(y, :)] = (y, 128, 255 - y)`): 신규 `py_subscript_assign` 블록. OBJ / SLICE / VALUE 모두 value-input.
- [x] **Attribute LHS 대입** (`self.n = 0`): 신규 `py_attr_assign` 블록.
- [x] **py_call mutator 확장**: `_rebuild(n, hasCallee)` 가 CALLEE input을 동적으로 추가/제거하고 saveExtraState/loadExtraState/mutationToDom 모두 함께 직렬화. 워크스페이스 저장 후 새로고침해도 chain call이 그대로 살아남음.

### 현재 테스트 현황 (Sprint 6 완료 시점)

- Playwright E2E: **92 / 92** 초록 (Sprint 6는 단일 종합 테스트로 추가됨).
- Vitest unit: **81 / 81** 초록.
- 합계 **173개 초록 테스트**.

### Sprint 7 — introspection coverage (완료)

`tests/e2e/sprint7_introspection_coverage.spec.js`의 SPR7-01 ~ SPR7-03 초록.

이번에 고친 실제 증상: "cv2.cvtColor / cv2.imencode 등이 토큰에 안 잡혀서 스니펫이 내린 Python 이 결국 py_call 통제 블록으로만 떨어졌음."

- [x] **backend/`_params_from_docstring`**: `inspect.signature`가 ValueError를 던지는 C-extension callable (cv2, numpy 일부)에 대해 docstring 첫 줄 `func(a, b[, c]) -> X` 형식을 정규식으로 파싱해 인자명 복구. 예: `cv2.cvtColor` → `[src, code, dst]`, `cv2.imencode` → `[ext, img, params]`.
- [x] **backend/`/introspect` 정렬 + 옵션**: 같은 모듈에서 classes → functions → constants 순으로 정렬, 그리고 `callables_only` 플래그로 상수를 아예 뺄 수 있음. 이전엔 `ACCESS_*` 상수 1785개가 `max_items=60` 슬롯을 먹어버려 `cvtColor`까지 도달하지 못했음.
- [x] **frontend default `maxItems=500→800`, `callablesOnly=true`**: 스니펫 로드 시 자동으로 호출 가능한 심볼 대부분을 커버. cv2 ~680개, numpy ~460개 전부 블록화.
- [x] **스니펫 평탄화**: opencv-webcam / matplotlib-pandas-excel / requests-api 세 스니펫을 전부 한 줄 한 statement로 풀었음. `cap.read() if cap.isOpened() else (False, None)` 같은 IfExp 가 혹시 깨져도 로직이 살아남도록.
- [x] **IfExp 블록 추가**: `src/blocks/exactPythonBlocks.js`의 `py_ifexp` (BODY / TEST / ELSE value-input). `grand_python_coverage.spec.js` 에 ternary fixture 추가.

### 현재 테스트 현황 (Sprint 7 완료 시점)

- Playwright E2E: **95 / 95** 초록.
- Vitest unit: **81 / 81** 초록.

### 남은 후속 작업 (future sprints)

- 3-way view toggle (Exact / Semantic / Python) 도입.
- `structure_typed_function` 레거시 완전 제거 (현재 `py_funcdef`로 대체됐지만 구 블록은 toolbox에 남아있음).
- Semantic library 자동 합성이 receiver type까지 이해하도록 introspection 결과에 타입 힌트 추가.
- Abstraction panel UI — `propose_abstraction` tool 결과를 사용자가 직접 accept / reject할 수 있는 컴포넌트.
- Multi-target assignment (`a = b = 0`) exact lowering.

### 품질 게이트 (매 스프린트 종료 시 반드시 초록)

- `npm run test:unit`: vitest 81/81 초록 유지
- `npx playwright test tests/e2e/exact_preservation.spec.js`: 10/10 초록 유지 (Sprint 1 회귀 방지)
- `npx playwright test`: 전체 E2E 초록. 숫자가 늘어나는 건 좋지만 줄어들면 안 된다.
- Blueprint §완료 판정 기준 1~7 번 항목은 각 스프린트 종료 시 코드 레벨에서 재확인.

### 작업할 때 지키는 규칙 (Blueprint §647에서 발췌)

1. unsupported syntax를 `pass`나 `comment`로 낮추지 않는다.
2. semantic block으로 못 내리면 exact block으로 내려라.
3. exact block으로도 표현 못 하면 `raw_python`에 verbatim source를 넣어라.
4. source-preserving 테스트 없이 lowering 규칙을 추가하지 않는다.
5. UI가 ugly해져도 정보 손실보다 낫다.
6. LLM은 parser가 아니다.
7. 같은 Python은 어느 입력 경로에서도 같은 exact block graph를 만들어야 한다 (`RG-07`이 이를 감시한다).

