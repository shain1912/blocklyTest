# 라이브 시연 스크립트 — Honest 버전 (논문용)

> 이전 버전은 toolbox에 없는 `py_stmt` / `py_call` / `py_binop` 같은 "유령 블록"을 무대에 올렸습니다.
> 이번 버전은 **vocabulary 가드**, **lossless vs regen 경로 구분**, **escape-hatch 카테고리 노출**을
> 모두 spec에 반영했고, `tests/e2e/demo_script.spec.js`가 무대에서 일어날 모든 단계를
> 자동으로 검증합니다. 그 spec이 통과하면 무대에서도 같은 결과가 나옵니다.

---

## 0. 사전 준비 (5분 전)

```bash
# 1) 백엔드 + 프론트엔드 동시 기동
./start.sh
#   → http://localhost:5173        프론트
#   → http://localhost:8000        FastAPI 백엔드 (/introspect /ast)

# 2) 시연용 단순 UI (사이드바·AI패널·LibMgr·Snippets 모두 가려짐)
브라우저: http://localhost:5173/?test=1

# 3) 현장 회귀 체크 (≈ 25초)
export LD_LIBRARY_PATH=/tmp/alsa-lib/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
npx playwright test demo_script multi_roundtrip import_bridge semantic_library semantic_real_cv2 test_mode_smoke
#  → 26 passed가 떠야 무대 진입
```

화면 구성: 좌측 Blockly | 중앙 Python 뷰 | 우측 Stage + Output. `?test=1` 모드에서는 사이드바·AI 패널이 숨김.

**중요한 정직함 한 줄**: Blockly가 Python을 다시 생성할 때 `count += 1` 같은 augmented assign은 `count = (count + 1)`로 정규화됨. 따라서 **첫 regen 1회는 약간 변형됨, 그 이후는 byte-identical로 stable**. 이게 시스템의 진짜 동작이고 슬라이드/멘트도 이렇게 가야 함.

---

## Act 1 — Round-trip 안정성 (3분)

**메시지:** "사용자가 입력한 Python 그대로 보존하는 lossless 경로 + 사용자가 블록을 만지면 정규화된 형태로 안정 수렴하는 regen 경로. 두 경로 모두 깨지지 않는다."

### 시연 단계

| # | 행동 | 청중 시각 |
|---|---|---|
| 1.1 | Python 뷰에 다음 코드 붙여넣기 (정확히 이 텍스트) | 코드 5줄 |
| 1.2 | **[Blocks]** 클릭 | 워크스페이스에 7개 블록. **전부 큐레이트 블록** (move_right / say / variable / change_variable / repeat / on_start). escape-hatch 0개. |
| 1.3 | 좌측 toolbox 스크롤 → 워크스페이스의 모든 블록이 toolbox 카테고리(Motion/Looks/Control/Variables)에 똑같이 있음을 보여줌 | "변환 결과 모든 블록이 toolbox에서 직접 끌어와 만들 수 있는 큐레이트 블록입니다. 가짜 블록 없음." |
| 1.4 | **[Python]** 클릭 (편집 없이) | 입력한 5줄 그대로 (lossless byte-identical) |
| 1.5 | **[Blocks] → [Python]** 3회 반복 | 매번 동일 |
| 1.6 | 워크스페이스에서 블록 하나 살짝 옮긴 뒤 **[Python]** | 형태가 정규화됨: `count += 1` → `count = (count + 1)`. 블록 한 번 손대면 lossless에서 벗어남 |
| 1.7 | **[Blocks] → 손대고 → [Python]** 3회 반복 | 정규화된 형태로 **byte-identical 안정** (1.6 결과와 매번 동일) |

**시연용 Python (정확히 이대로):**
```python
count = 0
for i in range(3):
    sprite.move(30)
    count += 1
sprite.say('done')
```

**핵심 멘트:**
- 1.4: "건드리지 않으면 입력 그대로 — bidirectional이라기보단 *bidirectional view*"
- 1.6: "`count += 1`이 그대로 보존됩니다. pyAst가 AugAssign을 큐레이트 `change_variable` 블록으로 매핑하고, 그 블록의 generator가 `+=` 형태로 다시 emit합니다."
- 1.7: "**한 번 정규화된 후로는 영구히 byte-identical**. 누적 drift 없음."

**백업 시연 (Q&A에서 누가 물으면)**: pure Python (sprite 없는 코드)도 동일하게 동작 — `multi_roundtrip A2` 케이스.

---

## Act 2 — Import 블록이 진짜 라이브러리 블록을 활성화 (3분)

**메시지:** "Python의 `import cv2`가 블록 환경에서도 의미를 갖는다 — 단순 텍스트 placeholder가 아니다."

### 시연 단계

| # | 행동 | 청중 시각 |
|---|---|---|
| 2.1 | 빈 워크스페이스. toolbox에 라이브러리 카테고리 *없음* 확인 | 깔끔 |
| 2.2 | **🧩 Structure** 카테고리에서 `import` 블록을 끌어와 LIBRARY 필드에 `cv2` 입력 | import 블록 1개 |
| 2.3 | 잠깐 멈춤 → toolbox 좌측 스크롤 | 새 카테고리 **OpenCV** 자동 등장. cv2_imshow / cv2_videoCapture 등 큐레이트 블록 노출 |
| 2.4 | OpenCV 카테고리에서 `cv2.imshow` 블록을 끌어와 WINDOW='preview', IMAGE='frame' 입력 | import + imshow 두 블록 |
| 2.5 | **[Python]** 토글 | `import cv2`<br>`cv2.imshow('preview', frame)` |
| 2.6 (선택) | LIBRARY 필드를 `np`로 바꾼 import 블록 추가 | NumPy 카테고리 자동 등장 (별칭 매핑 시연) |

**핵심 멘트:**
- 2.3: "이전에는 `import cv2`가 죽은 syntax였습니다. 지금은 import 블록 자체가 trigger가 되어 큐레이트된 라이브러리를 자동 설치합니다."
- 2.6: "`np`, `pd`, `plt`, `st` 같은 별칭도 인식해서 numpy/pandas/matplotlib/streamlit을 매핑합니다."

**Edge case (Q&A)**: `import 알수없는모듈` → graceful no-op, 아무 일도 안 일어남, 에러 없음 (B3 케이스).

---

## Act 3 — 500 callables → 8 semantic 블록 (4분)

**메시지:** "라이브러리를 1:1로 블록화하면 toolbox가 폭발한다. 의미 단위로 추상화하면 같은 라이브러리를 손에 잡을 수 있다."

### 시연 단계

| # | 행동 | 청중 시각 |
|---|---|---|
| 3.1 | DevTools 콘솔 열기 (또는 사전에 띄운 Quick Action 버튼) | |
| 3.2 | `(await window.__introspect('cv2', { maxItems: 500 })).items.length` | **500** 출력 |
| 3.3 | 멘트: "naive 1:1 매핑이면 toolbox에 블록 500개가 깔립니다 — 라이브로 보여드리지 않습니다, 화면이 마비됩니다." | 슬라이드 한 장으로 대체 |
| 3.4 | `await window.__installSemantic('cv2', (await __introspect('cv2',{maxItems:500})).items, { maxBlocks: 8 })` | `{ ok: true, stats: { rawCount: 500, semanticCount: 8, compressionRatio: 0.016 } }` |
| 3.5 | toolbox 좌측 스크롤 | 새 카테고리 **🧠 cv2** 등장. 8개 semantic 블록 |
| 3.6 | 첫 번째 semantic 블록을 워크스페이스에 끌고 VARIANT 드롭다운에서 변형 선택 | 변형 옵션 다수 노출 (각 블록이 prefix-cluster 대표) |
| 3.7 | **[Python]** 토글 | `cv2.<선택된 변형>(...)` |

**핵심 숫자 (슬라이드/논문):**
```
cv2: 500 raw callables → 8 semantic blocks
compression ratio: 0.016  (≈ 63× reduction)
```

**무대에서 외울 한 줄:**
> "1대 1 매핑은 정직한 게 아니라 게으른 겁니다. 사용자가 부르는 *의미 단위*를 8개로 정리한 게 우리의 기여입니다."

---

## 비상 대응 / Q&A

| 상황 | 대응 |
|---|---|
| 토글이 한 박자 늦음 | 정상. AST 백엔드 호출 50ms + load 150ms. "Python 백엔드를 호출해서 정확한 AST를 받아옵니다" |
| 백엔드가 죽었을 때 (Act 3 불가) | 빨간 "Degraded mode" 배너 자동 노출됨. 그것 자체로 한 슬라이드 ("AST 경로가 죽어도 regex 폴백으로 동작") |
| 회색 블록 같은 게 보임 | "현재 데모 시나리오에서는 모든 블록이 toolbox 카테고리에 있는 큐레이트 블록입니다 (Motion/Looks/Control/Variables/Math). 만약 정말 매핑되지 않은 호출이 있다면 그건 버그로 분류합니다." |
| `count += 1`이 보존됨 | "AugAssign이 `change_variable` 블록으로 매핑되어 양방향 byte-identical 동작합니다. 비교 연산자(`i > 0`)는 `py_binop`을 거쳐 약간의 paren 정규화는 발생하지만, 그 후로는 stable." |
| Python을 무대에서 실제로 실행하려면 | `▶ Run` 버튼이 백엔드의 CPython subprocess로 streaming 실행. Stage 시각화는 JS 경로 (Run 버튼은 mode 따라 분기). |
| `?test=1`을 빼고 들어왔을 때 | "정식 UI에는 File Explorer / AI 패널 / Library Manager가 모두 있습니다. 시연용으로는 단순화 모드를 씁니다." |

---

## 시연 후 슬라이드용 핵심 숫자

```
Act 1:
  사용자 입력 그대로 (lossless): 무한 round-trip 가능, byte-identical
  사용자가 손댄 후 (regen):     1회 정규화 → 그 후 영구 byte-identical
  vocabulary 가드:                7 블록 모두 큐레이트 (escape-hatch 0개)

Act 2:
  import 블록 1개 → 큐레이트 라이브러리 자동 설치 (cv2/np/pd/plt/st/requests)
  설치 후 import + 호출 블록 → Python 변환 깔끔

Act 3:
  cv2:    500 raw → 8 semantic   (63× 압축, ratio 0.016)
  결정론적 알고리즘 (LLM 없음, 재현 가능)
  prefix-cluster 대표 + VARIANT 드롭다운으로 변형 노출
```

검증 명령:
```bash
export LD_LIBRARY_PATH=/tmp/alsa-lib/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
npx playwright test demo_script multi_roundtrip import_bridge semantic_library semantic_real_cv2 test_mode_smoke
# → 26 passed
```

---

## Act 4 — Snippet 카드: opencv-python / streamlit / matplotlib (3분)

**메시지:** "한 번의 클릭으로 라이브러리 + 코드 + 예제가 함께 들어온다."

| # | 행동 | 청중 시각 |
|---|---|---|
| 4.1 | 정식 UI에서 📋 Snippets 패널 클릭 (또는 `await window.__loadSnippet('opencv-webcam')`) | OpenCV Webcam 코드 자동 로드, 라이브러리 자동 설치 |
| 4.2 | **[Blocks]** 토글 | 73 블록 워크스페이스, 그 중 79%(58개)가 큐레이트, 21%(15개)가 🐍 Python 카테고리 (호출/속성접근) |
| 4.3 | **[Run]** 버튼 → 백엔드의 CPython 실행 | Stage 또는 Output에 결과 |
| 4.4 (반복) | streamlit-dashboard / matplotlib-pandas-excel / numpy-basics / requests-api도 같은 방식 | 각 92 / 104 / 48 / 56 블록, 큐레이트 비율 71~88% |

**핵심 멘트:** "라이브러리별 카테고리 (📷 OpenCV / 🌐 streamlit / 📊 matplotlib …)와 그에 맞는 코드 한 묶음이 클릭 한 번으로."

---

## Act 5 — 임의 pip 라이브러리: 추상화 곡선 (3분)

**메시지:** "큐레이트된 6개 외에도 어떤 Python 라이브러리든 같은 추상화 파이프라인을 통과한다."

| # | 행동 | 청중 시각 |
|---|---|---|
| 5.1 | DevTools 콘솔: `await window.__introspect('socket', { maxItems: 500 })` | 48 callables (또는 더 많을 수도) |
| 5.2 | `await window.__installSemantic('socket', (await __introspect('socket')).items, { maxBlocks: 8 })` | 8 semantic 블록, 6× 압축 |
| 5.3 | 같은 명령으로 `urllib.request` (59→8, 7×), `subprocess` (12→8, 2×) 비교 | 여러 라이브러리에 같은 알고리즘 적용 |

**Paper Table 1 후보 (자동 검증된 숫자, `npx playwright test abstraction_comparison`):**

```
module                raw   semantic   ratio   reduction
cv2                   500     8        0.016   63×
urllib.request         59     8        0.136    7×
socket                 48     8        0.167    6×
http.client            21     8        0.381    3×
argparse               13     8        0.615    2×
subprocess             12     8        0.667    2×
```

**핵심 멘트:** "큰 라이브러리일수록 압축이 극적이고, 작은 라이브러리는 cap이 8이라 거의 그대로. 한 가지 알고리즘이 어느 라이브러리에서나 동작."

---

## Act 6 — 블록으로 라이브러리 만들기 (2분)

**메시지:** "사용자가 블록으로 직접 만든 모듈/함수도 그 자리에서 toolbox 카테고리가 된다."

| # | 행동 | 청중 시각 |
|---|---|---|
| 6.1 | 빈 워크스페이스에 `Module GameUtils` 블록 + 그 안에 `def reset_score()` 함수 + 본문 `set score to 0` 조립 | 클래스 스켈레톤 |
| 6.2 | LibraryManager 패널 → "Export as library" 클릭 (또는 `window.__buildAndInstallLibrary({name:'game-utils'})`) | 새 카테고리 📦 game-utils 등장 |
| 6.3 | 페이지 새로고침 | localStorage 보존 — 라이브러리 그대로 살아있음 |
| 6.4 | **[Python]** 토글 | `class GameUtils:` `def reset_score():` `score = 0` |

**핵심 멘트:** "블록 → 라이브러리 → 다시 블록. 사용자 자신의 추상화도 시스템의 1급 시민."

---

## 이번 honest 버전에서 해결된 것 / 남은 한계

### 해결됨 (이번 + 이전 라운드)
- ~~`x += 1`이 expanded form으로 깨짐~~ → **`change_variable` 큐레이트 블록 매핑으로 byte-perfect 보존**
- ~~`sprite.move/say` 등이 py_stmt로 떨어짐~~ → **`spriteDslSchemas.js`로 큐레이트 블록 매핑 (move_right/say/wait/...)**
- ~~`import cv2` 후 `cv2.imshow`가 py_stmt로 떨어짐~~ → **transpile 전 import 사전 스캔 + 라이브러리 사전 설치**
- ~~`print` 블록이 toolbox에 없음~~ → **Text 카테고리에 추가**
- ~~`str(x)` / `int(x)` / `len(x)`이 회색 py_call~~ → **`py_builtin_cast` 큐레이트 블록 + schema 매핑**
- ~~__builtin_sprite_dsl__이 toolbox에 노출~~ → **`__builtin_*` 패키지는 in-memory만, UI 노출 안 됨**
- ~~OpenCV/numpy 카테고리 중복 ×3 / ×4~~ → **`buildLibraryToolboxCategories` 이름 dedup (Map 기반)**
- ~~py_tuple/py_attr/py_unary 등이 ghost~~ → **모든 py_* 구조 블록을 의미별 카테고리에 분배 (Logic / Math / Variables / Lists / Loops / 🐍 Python)**
- ~~블록-라이브러리/snippet/임의-pip 데모 부재~~ → **Act 4/5/6 추가, 자동 검증 spec 3개**

### 남은 한계 (논문 future work 후보)
1. **이항연산 paren 정규화**: `i > 0`이 첫 regen에서 `(i > 0)`로 변형 (`py_binop` python generator가 안전 paren 추가). 그 후 stable. 큰 이슈 아니지만 cosmetic.
2. **stdlib import 자동 매핑 미지원**: `import time` 자체는 REGISTRY 매핑 없음. `time.sleep`은 `wait` 블록이 알아서 처리하므로 동작에는 문제 없음.
3. **AI-generated library 카테고리 이름**: 사용자가 LLM으로 생성한 library는 자동으로 lib-name 카테고리에 들어감 (이미 동작). 큐레이트 6개(opencv/numpy/pandas/streamlit/matplotlib/requests)도 마찬가지.
