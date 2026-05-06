# Python Backend Setup

The blocks→Python flow used to be cosmetic: switching to Python view showed
generated code, but clicking Run only ever evaluated the JavaScript the blocks
produced. That has changed.

## What the backend does

`backend/main.py` is a small FastAPI server that runs as a long-lived process
next to the Vite dev server. It speaks HTTP + WebSockets:

| route                     | method | purpose                                  |
| ------------------------- | ------ | ---------------------------------------- |
| `/health`                 | GET    | readiness probe + python version         |
| `/sessions`               | GET    | list all active subprocess sessions      |
| `/run`                    | POST   | start a `python script.py` child         |
| `/install`                | POST   | `pip install <pkg>` with streamed output |
| `/streamlit/run`          | POST   | boot a Streamlit app on a free port      |
| `/stop/{session_id}`      | POST   | send SIGTERM to a session                |
| `/sessions/{session_id}`  | DELETE | forget a session (and kill it)           |
| `/ws/{session_id}`        | WS     | stream `{stdout, stderr, event}` frames  |

Each spawn creates its own process group (`os.setsid`) so we can signal the
whole tree. Output is piped line-by-line into an `asyncio.Queue` and the
WebSocket drains it with a 1s heartbeat.

## Starting everything

```bash
./start.sh
```

Dev server on `:5173`, backend on `:8000`. Logs are at
`/tmp/blockly-frontend.log` and `/tmp/blockly-backend.log`. Ctrl-C cleans
both up.

To run the two manually:

```bash
# terminal 1
python3 backend/main.py

# terminal 2
npm run dev
```

## How the frontend talks to it

`src/utils/pythonBackend.js` exposes `runPython`, `runStreamlit`,
`installPackage`, `checkHealth`. `App.jsx` routes the Run button:

- **Blocks mode**: generated JS still runs in-browser (Scratch sprite).
- **Python mode**: POST `/run`, open the WebSocket, append stdout/stderr to
  the Output panel, and show a Stop button while the session is alive.

If the code imports `streamlit`, the frontend calls `/streamlit/run`
instead. The backend launches `streamlit run app.py` on a free port; the
Stage area shows an iframe of the app.

## Where the Python env comes from

`backend/main.py` uses `sys.executable` — whichever Python you launched it
with. `pip install` goes into the same environment. On WSL this project
was tested against `/home/seong/miniconda3/bin/python3` (3.13).

## Known limits

- `cv2.imshow()` needs an X server; in headless WSL it will raise
  `cv2.error: The function is not implemented`. That's not a bug in the
  backend; it's an OpenCV build flavour issue. Use `cv2.imwrite` or write
  frames to disk while developing here.
- There is no sandboxing — the subprocess has the same access as whoever
  started the backend. Don't expose port 8000 to the open internet.
- Streamlit boots in ~2s; the iframe loads a hair later. The frontend
  waits 2.5s before pointing the iframe at the URL.
