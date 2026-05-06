/**
 * One-click Python snippets: each entry declares the pip packages it needs
 * and the Python code to drop into the editor.  Clicking a card installs
 * everything, loads the code, and hands off to the user — who just presses Run.
 *
 * Convention:
 *   Snippets that produce an image should print `IMG::<base64-png>` so the
 *   Output panel renders it inline (see src/components/Output.jsx).
 */

export const PYTHON_SNIPPETS = [
  {
    id: 'opencv-webcam',
    icon: '📷',
    title: 'OpenCV · Webcam Snapshot',
    description: 'Capture a frame (or synthesize one), convert to grayscale, show inline.',
    packages: ['opencv-python', 'numpy'],
    imports: ['cv2', 'numpy'],
    // Kept deliberately flat: one statement per line, no ternary, no
    // chained method calls. Every construct here lowers to a single
    // exact block so the Blocks view matches the Python 1:1.
    code: `import cv2
import numpy as np
import base64

cap = cv2.VideoCapture(0)
ok = cap.isOpened()

if ok:
    ok, frame = cap.read()
else:
    frame = None

cap.release()

if not ok:
    print("no webcam — using synthetic test image")
    frame = np.zeros((240, 320, 3), dtype=np.uint8)
    for y in range(240):
        frame[y] = (y, 128, 255 - y)

gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
shape = frame.shape
print("captured shape:", shape)

mean = gray.mean()
print("gray mean brightness:", round(float(mean), 2))

ok, buf = cv2.imencode(".png", gray)
raw_bytes = buf.tobytes()
encoded = base64.b64encode(raw_bytes)
b64 = encoded.decode()

print("IMG::" + b64)
print("done.")
`,
  },

  {
    id: 'matplotlib-pandas-excel',
    icon: '📊',
    title: 'matplotlib · pandas · Excel',
    description: 'Build a DataFrame, write + read an .xlsx file, plot a chart inline.',
    packages: ['matplotlib', 'pandas', 'openpyxl'],
    imports: ['matplotlib', 'pandas', 'openpyxl'],
    // Flattened to one-statement-per-line so the Blocks view mirrors Python exactly.
    code: `import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import io
import base64

months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
sales = [120, 135, 98, 174, 210, 188]
returns = [10, 12, 8, 15, 18, 14]

data = {"month": months, "sales": sales, "returns": returns}
df = pd.DataFrame(data)

path = "/tmp/sales.xlsx"
df.to_excel(path, index=False)
back = pd.read_excel(path)
print("wrote", path, "rows:", len(back))
print(back)

fig, ax = plt.subplots()
ax.plot(df["month"], df["sales"], marker="o", label="sales")
ax.plot(df["month"], df["returns"], marker="s", label="returns")
ax.set_title("Monthly sales vs returns")
ax.grid()
ax.legend()

buf = io.BytesIO()
fig.savefig(buf, format="png", bbox_inches="tight", dpi=110)
plt.close(fig)

raw_bytes = buf.getvalue()
encoded = base64.b64encode(raw_bytes)
b64 = encoded.decode()
print("IMG::" + b64)
print("done.")
`,
  },

  {
    id: 'streamlit-dashboard',
    icon: '🚀',
    title: 'Streamlit · Mini Dashboard',
    description: 'Title, number input, live chart — launches on a free port, appears in the Stage iframe.',
    packages: ['streamlit', 'pandas', 'numpy'],
    imports: ['streamlit', 'pandas', 'numpy'],
    code: `import streamlit as st
import pandas as pd
import numpy as np

st.title("📈 Mini Dashboard")
st.write("This whole UI is generated from the Python code on the left.")

n = st.slider("How many points?", 10, 500, 100)
seed = st.number_input("Random seed", value=42, step=1)

rng = np.random.default_rng(int(seed))
df = pd.DataFrame({
    "x": np.arange(n),
    "sin":   np.sin(np.linspace(0, 6, n)) + rng.normal(0, 0.1, n),
    "cos":   np.cos(np.linspace(0, 6, n)) + rng.normal(0, 0.1, n),
    "noise": rng.normal(0, 1, n).cumsum(),
})

st.line_chart(df.set_index("x"))

col1, col2, col3 = st.columns(3)
col1.metric("sin max",   round(df["sin"].max(),   3))
col2.metric("cos min",   round(df["cos"].min(),   3))
col3.metric("noise std", round(df["noise"].std(), 3))

if st.button("Show raw data"):
    st.dataframe(df)
`,
  },

  {
    id: 'requests-api',
    icon: '🌐',
    title: 'requests · Public API',
    description: 'Call a public JSON API and print a few fields.',
    packages: ['requests'],
    imports: ['requests'],
    // Flattened: no chained calls; every method call is on its own line so
    // the block tree is 1:1 with the Python.
    code: `import requests
import json

url = "https://jsonplaceholder.typicode.com/posts"
r = requests.get(url, timeout=10)
r.raise_for_status()

status = r.status_code
posts = r.json()
count = len(posts)
print("status:", status)
print("received", count, "posts")

top3 = posts[0:3]
for p in top3:
    print("-", p["id"], p["title"])

first = posts[0]
pretty = json.dumps(first, indent=2)
print(pretty[0:400])
`,
  },

  {
    id: 'numpy-basics',
    icon: '🔢',
    title: 'numpy · Linear Algebra',
    description: 'Matrix multiply, determinant, eigenvalues — no display needed.',
    packages: ['numpy'],
    imports: ['numpy'],
    code: `import numpy as np

A = np.array([[4, 2, 1],
              [2, 5, 3],
              [1, 3, 6]], dtype=float)

print("matrix A:")
print(A)
print("A @ Aᵀ =")
print(A @ A.T)
print("det(A) =", round(float(np.linalg.det(A)), 4))
eig = np.linalg.eigvals(A)
print("eigenvalues:", [round(float(v), 4) for v in sorted(eig.real, reverse=True)])
`,
  },
];

export const findSnippet = (id) => PYTHON_SNIPPETS.find(s => s.id === id);
