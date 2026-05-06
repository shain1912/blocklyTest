import React, { useEffect, useState, useRef, useCallback } from 'react';
import './Stage.css';

const Stage = ({ isRunning }) => {
    const [variables, setVariables] = useState({}); // { name: { value, visible } }
    const [spriteState, setSpriteState] = useState({
        x: 0,
        y: 0,
        direction: 90,
        size: 100,
        visible: true,
        talking: null,
        thinking: null,
        spriteType: 'cat',  // 'cat' | 'turtle' | 'arrow' | 'dog' | 'robot' | 'ball'
        costumes: ['cat'], // list of available costumes
        currentCostumeIndex: 0
    });
    const [backdrop, setBackdrop] = useState({
        type: 'color', // 'color' | 'image'
        value: '#ffffff', // color or image URL
        name: 'white',
        backdrops: [
            { name: 'white', type: 'color', value: '#ffffff' },
            { name: 'blue-sky', type: 'color', value: '#87CEEB' },
            { name: 'green', type: 'color', value: '#90EE90' },
            { name: 'space', type: 'color', value: '#0a0a1a' }
        ],
        currentBackdropIndex: 0
    });

    const spriteStateRef = useRef(spriteState);
    const backdropRef = useRef(backdrop);
    const variablesRef = useRef(variables);
    const keysPressed = useRef({});
    const mousePos = useRef({ x: 0, y: 0 });
    const isMouseDown = useRef(false);
    const timerStart = useRef(Date.now());

    // Pen drawing state
    const drawingCanvasRef = useRef(null);
    const isPenDown = useRef(false);
    const penColor = useRef('#e11d48');
    const penSize = useRef(2);

    // Draw a line on the pen canvas (sprite coordinate space: center origin, Y-up)
    const penDrawLine = useCallback((x1, y1, x2, y2) => {
        const canvas = drawingCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        ctx.beginPath();
        ctx.strokeStyle = penColor.current;
        ctx.lineWidth = penSize.current;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(cx + x1, cy - y1);
        ctx.lineTo(cx + x2, cy - y2);
        ctx.stroke();
    }, []);

    // Update ref when state changes so controller can access latest state
    useEffect(() => {
        spriteStateRef.current = spriteState;
    }, [spriteState]);

    useEffect(() => {
        backdropRef.current = backdrop;
    }, [backdrop]);

    useEffect(() => {
        variablesRef.current = variables;
    }, [variables]);

    useEffect(() => {
        const handleKeyDown = (e) => { keysPressed.current[e.code] = true; keysPressed.current[e.key] = true; };
        const handleKeyUp = (e) => { delete keysPressed.current[e.code]; delete keysPressed.current[e.key]; };
        const handleMouseMove = (e) => {
            // Calculate mouse position relative to stage center (approximate for demo)
            const stage = document.querySelector('.stage-canvas');
            if (stage) {
                const rect = stage.getBoundingClientRect();
                mousePos.current = {
                    x: e.clientX - rect.left - rect.width / 2,
                    y: -(e.clientY - rect.top - rect.height / 2) // Invert Y for Scratch coords
                };
            }
        };
        const handleMouseDown = () => { isMouseDown.current = true; };
        const handleMouseUp = () => { isMouseDown.current = false; };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    useEffect(() => {
        // Expose controller to window for generated code to use
        window.spriteController = {
            move: async (steps) => {
                const rad = (spriteStateRef.current.direction - 90) * (Math.PI / 180);
                const oldX = spriteStateRef.current.x;
                const oldY = spriteStateRef.current.y;
                const newX = oldX + Math.cos(rad) * steps;
                const newY = oldY + Math.sin(rad) * steps;
                if (isPenDown.current) penDrawLine(oldX, oldY, newX, newY);
                setSpriteState(prev => ({ ...prev, x: newX, y: newY }));
                await new Promise(r => setTimeout(r, 16));
            },
            turn: async (degrees) => {
                console.log(`Turned ${degrees} degrees`);
                setSpriteState(prev => ({
                    ...prev,
                    direction: prev.direction + degrees
                }));
                await new Promise(r => setTimeout(r, 16));
            },
            setX: async (x) => {
                if (isPenDown.current) penDrawLine(spriteStateRef.current.x, spriteStateRef.current.y, Number(x), spriteStateRef.current.y);
                setSpriteState(prev => ({ ...prev, x: Number(x) }));
                await new Promise(r => setTimeout(r, 16));
            },
            setY: async (y) => {
                if (isPenDown.current) penDrawLine(spriteStateRef.current.x, spriteStateRef.current.y, spriteStateRef.current.x, Number(y));
                setSpriteState(prev => ({ ...prev, y: Number(y) }));
                await new Promise(r => setTimeout(r, 16));
            },
            getX: async () => spriteStateRef.current.x,
            getY: async () => spriteStateRef.current.y,
            getDirection: async () => spriteStateRef.current.direction,
            say: async (text, seconds = 0) => {
                console.log(`Sprite says: "${text}"`);
                setSpriteState(prev => ({ ...prev, talking: text, thinking: null }));
                if (seconds > 0) {
                    await new Promise(r => setTimeout(r, seconds * 1000));
                    setSpriteState(prev => ({ ...prev, talking: null }));
                }
            },
            think: async (text, seconds = 0) => {
                console.log(`Sprite thinks: "${text}"`);
                setSpriteState(prev => ({ ...prev, thinking: text, talking: null }));
                if (seconds > 0) {
                    await new Promise(r => setTimeout(r, seconds * 1000));
                    setSpriteState(prev => ({ ...prev, thinking: null }));
                }
            },
            goTo: async (x, y) => {
                if (isPenDown.current) penDrawLine(spriteStateRef.current.x, spriteStateRef.current.y, Number(x), Number(y));
                setSpriteState(prev => ({ ...prev, x: Number(x), y: Number(y) }));
                await new Promise(r => setTimeout(r, 16));
            },
            glide: async (seconds, x, y) => {
                const start = { x: spriteStateRef.current.x, y: spriteStateRef.current.y };
                const end = { x: Number(x), y: Number(y) };
                const steps = Math.max(1, Math.round(seconds * 60));
                let prevX = start.x, prevY = start.y;
                for (let i = 1; i <= steps; i++) {
                    const t = i / steps;
                    const nx = start.x + (end.x - start.x) * t;
                    const ny = start.y + (end.y - start.y) * t;
                    if (isPenDown.current) penDrawLine(prevX, prevY, nx, ny);
                    prevX = nx; prevY = ny;
                    setSpriteState(prev => ({ ...prev, x: nx, y: ny }));
                    await new Promise(r => setTimeout(r, (seconds * 1000) / steps));
                }
            },
            changeX: async (dx) => {
                const nx = spriteStateRef.current.x + Number(dx);
                if (isPenDown.current) penDrawLine(spriteStateRef.current.x, spriteStateRef.current.y, nx, spriteStateRef.current.y);
                setSpriteState(prev => ({ ...prev, x: nx }));
                await new Promise(r => setTimeout(r, 16));
            },
            changeY: async (dy) => {
                const ny = spriteStateRef.current.y + Number(dy);
                if (isPenDown.current) penDrawLine(spriteStateRef.current.x, spriteStateRef.current.y, spriteStateRef.current.x, ny);
                setSpriteState(prev => ({ ...prev, y: ny }));
                await new Promise(r => setTimeout(r, 16));
            },
            setDirection: async (degrees) => {
                setSpriteState(prev => ({ ...prev, direction: Number(degrees) }));
                await new Promise(r => setTimeout(r, 16));
            },
            pointTowards: async (target) => {
                if (target === 'mouse-pointer') {
                    const dx = mousePos.current.x - spriteStateRef.current.x;
                    const dy = mousePos.current.y - spriteStateRef.current.y;
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
                    setSpriteState(prev => ({ ...prev, direction: angle }));
                    await new Promise(r => setTimeout(r, 16));
                }
            },
            ifOnEdgeBounce: async () => {
                const stage = document.querySelector('.stage-canvas');
                if (!stage) return;
                const rect = stage.getBoundingClientRect();
                const hw = rect.width / 2;
                const hh = rect.height / 2;
                const { x, y, direction } = spriteStateRef.current;
                let newDir = direction;
                let newX = x;
                let newY = y;
                // Reflect off vertical walls (left/right): reverse x-velocity → newDir = -direction
                if (x > hw - 50) { newX = hw - 50; if (Math.cos((direction - 90) * Math.PI / 180) > 0) newDir = -direction; }
                if (x < -(hw - 50)) { newX = -(hw - 50); if (Math.cos((direction - 90) * Math.PI / 180) < 0) newDir = -direction; }
                // Reflect off horizontal walls (top/bottom): reverse y-velocity → newDir = 180 - direction
                if (y > hh - 50) { newY = hh - 50; if (Math.sin((direction - 90) * Math.PI / 180) > 0) newDir = 180 - direction; }
                if (y < -(hh - 50)) { newY = -(hh - 50); if (Math.sin((direction - 90) * Math.PI / 180) < 0) newDir = 180 - direction; }
                setSpriteState(prev => ({ ...prev, x: newX, y: newY, direction: newDir }));
                await new Promise(r => setTimeout(r, 16));
            },
            switchCostume: async (costume) => {
                console.log('Costume switched to', costume);
                const costumes = spriteStateRef.current.costumes || ['cat'];
                const idx = costumes.indexOf(costume);
                if (idx !== -1) {
                    setSpriteState(prev => ({ ...prev, spriteType: costume, currentCostumeIndex: idx }));
                }
            },
            nextCostume: async () => {
                console.log('Next costume');
                const costumes = spriteStateRef.current.costumes || ['cat'];
                const nextIdx = (spriteStateRef.current.currentCostumeIndex + 1) % costumes.length;
                setSpriteState(prev => ({ ...prev, spriteType: costumes[nextIdx], currentCostumeIndex: nextIdx }));
            },

            // Volume (visual stub - no actual audio volume API cross-browser easily)
            setVolume: async (vol) => { console.log(`Volume set to ${vol}`); },
            changeVolume: async (amount) => { console.log(`Volume changed by ${amount}`); },
            getVolume: async () => 100,
            stopAllSounds: async () => { console.log('All sounds stopped'); },

            playSound: async (soundName) => {
                console.log(`Playing sound: "${soundName}"`);
                try {
                    // Try to play from public/sounds/ folder or root
                    // Assuming soundName matches filename for now (e.g., "meow" -> "meow.mp3" or just "meow")
                    // If no extension, try .mp3 or .wav
                    let src = soundName;
                    if (!src.includes('.')) src += '.mp3';

                    const audio = new Audio(src);
                    audio.play().catch(e => console.warn(`Sound "${soundName}" failed to play:`, e));
                } catch (e) {
                    console.error("Audio error:", e);
                }
            },

            playSoundUntilDone: async (soundName) => {
                console.log(`Playing sound until done: "${soundName}"`);
                return new Promise((resolve) => {
                    try {
                        let src = soundName;
                        if (!src.includes('.')) src += '.mp3';
                        const audio = new Audio(src);

                        audio.addEventListener('ended', resolve);
                        audio.addEventListener('error', (e) => {
                            console.warn(`Sound "${soundName}" failed to load/play:`, e);
                            resolve(); // Resolve anyway to not hang the script
                        });

                        audio.play().catch(e => {
                            console.warn(`Sound play error:`, e);
                            resolve();
                        });
                    } catch (e) {
                        console.error("Audio setup error:", e);
                        resolve();
                    }
                });
            },

            setSize: async (size) => setSpriteState(prev => ({ ...prev, size: Number(size) })),
            changeSize: async (amount) => setSpriteState(prev => ({ ...prev, size: prev.size + Number(amount) })),
            getSize: async () => spriteStateRef.current.size,
            setVisible: async (visible) => setSpriteState(prev => ({ ...prev, visible })),

            // Sensing
            isKeyPressed: async (key) => {
                if (key === 'any') return Object.keys(keysPressed.current).length > 0;
                return !!keysPressed.current[key];
            },
            getMouseX: async () => Math.round(mousePos.current.x),
            getMouseY: async () => Math.round(mousePos.current.y),
            isMouseDown: async () => isMouseDown.current,
            getTimer: async () => (Date.now() - timerStart.current) / 1000,
            resetTimer: async () => { timerStart.current = Date.now(); },
            distanceTo: async (target) => {
                if (target === 'mouse-pointer') {
                    const dx = mousePos.current.x - spriteStateRef.current.x;
                    const dy = mousePos.current.y - spriteStateRef.current.y;
                    return Math.sqrt(dx * dx + dy * dy);
                }
                return 0;
            },
            isTouchingColor: async (color) => false, // Placeholder
            getAttribute: async (target, attr) => {
                if (attr === 'x') return spriteStateRef.current.x;
                if (attr === 'y') return spriteStateRef.current.y;
                if (attr === 'direction') return spriteStateRef.current.direction;
                if (attr === 'size') return spriteStateRef.current.size;
                return 0;
            },
            setAttribute: async (target, attr, val) => {
                if (attr === 'x') window.spriteController.setX(val);
                if (attr === 'y') window.spriteController.setY(val);
            },

            // ── Sprite appearance ────────────────────────────────────────
            setSpriteType: (type) => {
                setSpriteState(prev => ({ ...prev, spriteType: type }));
            },

            // ── Variable monitors ────────────────────────────────────────
            setVariable: (name, value) => {
                setVariables(prev => ({
                    ...prev,
                    [name]: { value, visible: prev[name]?.visible !== false }
                }));
            },
            showVariable: (name) => {
                setVariables(prev => ({
                    ...prev,
                    [name]: { ...(prev[name] || { value: 0 }), visible: true }
                }));
            },
            hideVariable: (name) => {
                setVariables(prev => ({
                    ...prev,
                    [name]: { ...(prev[name] || { value: 0 }), visible: false }
                }));
            },

            // ── Backdrop controls ───────────────────────────────────────
            switchBackdrop: async (backdropName) => {
                const backdrops = backdropRef.current.backdrops;
                const found = backdrops.find(b => b.name === backdropName);
                if (found) {
                    const idx = backdrops.indexOf(found);
                    setBackdrop(prev => ({ ...prev, ...found, currentBackdropIndex: idx }));
                }
            },
            nextBackdrop: async () => {
                const backdrops = backdropRef.current.backdrops;
                const nextIdx = (backdropRef.current.currentBackdropIndex + 1) % backdrops.length;
                const next = backdrops[nextIdx];
                setBackdrop(prev => ({ ...prev, ...next, currentBackdropIndex: nextIdx }));
            },
            getBackdropNumber: async () => backdropRef.current.currentBackdropIndex + 1,
            getBackdropName: async () => backdropRef.current.name,

            // ── Pen controls ────────────────────────────────────────────
            penDown: () => { isPenDown.current = true; },
            penUp:   () => { isPenDown.current = false; },
            setPenColor: (color) => { penColor.current = color; },
            setPenSize:  (size)  => { penSize.current = Number(size); },
            clearPen: () => {
                const canvas = drawingCanvasRef.current;
                if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            },

            // Test hooks: synchronous snapshot of current sprite state for Playwright
            getState: () => ({ ...spriteStateRef.current }),
            getVariables: () => {
                const out = {};
                for (const [k, v] of Object.entries(variablesRef.current || {})) {
                    out[k] = { ...v };
                }
                return out;
            },

            reset: () => {
                setSpriteState({
                    x: 0, y: 0, direction: 90, size: 100, visible: true,
                    talking: null, thinking: null, spriteType: 'cat',
                    costumes: ['cat'], currentCostumeIndex: 0
                });
                setBackdrop({
                    type: 'color',
                    value: '#ffffff',
                    name: 'white',
                    backdrops: [
                        { name: 'white', type: 'color', value: '#ffffff' },
                        { name: 'blue-sky', type: 'color', value: '#87CEEB' },
                        { name: 'green', type: 'color', value: '#90EE90' },
                        { name: 'space', type: 'color', value: '#0a0a1a' }
                    ],
                    currentBackdropIndex: 0
                });
                setVariables({});
                isPenDown.current = false;
                const canvas = drawingCanvasRef.current;
                if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
                timerStart.current = Date.now();
            }
        };

        return () => {
            delete window.spriteController;
        };
    }, []);

    // Keep drawing canvas sized to its container
    const stageCanvasRef = useRef(null);
    useEffect(() => {
        const container = stageCanvasRef.current;
        if (!container) return;
        const sync = () => {
            const canvas = drawingCanvasRef.current;
            if (!canvas) return;
            canvas.width  = container.clientWidth;
            canvas.height = container.clientHeight;
        };
        sync();
        const ro = new ResizeObserver(sync);
        ro.observe(container);
        return () => ro.disconnect();
    }, []);

    return (
        <div className="stage-container">
            <div className="stage-header">
                <h2>Stage</h2>
                <div className="stage-controls">
                    <button className="icon-btn" title="Clear drawing" onClick={() => {
                        const canvas = drawingCanvasRef.current;
                        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
                    }}>🗑</button>
                </div>
            </div>
            <div
                className="stage-canvas"
                data-testid="stage-canvas"
                ref={stageCanvasRef}
                style={{
                    backgroundColor: backdrop.type === 'color' ? backdrop.value : undefined,
                    backgroundImage: backdrop.type === 'image' ? `url(${backdrop.value})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                }}
            >
                {/* Pen drawing layer — fixed to stage, NOT inside sprite */}
                <canvas
                    ref={drawingCanvasRef}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
                />

                {/* Variable Monitors (Scratch-style) */}
                {Object.entries(variables)
                    .filter(([, v]) => v.visible)
                    .map(([name, v], i) => (
                        <div key={name} className="var-monitor" style={{ top: 8 + i * 36, left: 8 }}>
                            <span className="var-monitor-name">{name}</span>
                            <span className="var-monitor-value">{
                                typeof v.value === 'number'
                                    ? (Number.isInteger(v.value) ? v.value : parseFloat(v.value.toFixed(2)))
                                    : String(v.value)
                            }</span>
                        </div>
                    ))
                }

                {spriteState.visible && (
                    <div
                        className="sprite"
                        style={{
                            transform: `translate(${spriteState.x}px, ${-spriteState.y}px) rotate(${spriteState.direction - 90}deg) scale(${spriteState.size / 100})`,
                            zIndex: 2,
                        }}
                    >
                        <div className="sprite-image">
                            {spriteState.spriteType === 'turtle' ? (
                                /* Top-down turtle SVG facing right */
                                <svg width="60" height="60" viewBox="0 0 60 60">
                                    <ellipse cx="14" cy="14" rx="7" ry="5" fill="#4a8c3a" stroke="#2a5c1a" strokeWidth="1.5" transform="rotate(-35,14,14)"/>
                                    <ellipse cx="46" cy="14" rx="7" ry="5" fill="#4a8c3a" stroke="#2a5c1a" strokeWidth="1.5" transform="rotate(35,46,14)"/>
                                    <ellipse cx="14" cy="46" rx="7" ry="5" fill="#4a8c3a" stroke="#2a5c1a" strokeWidth="1.5" transform="rotate(35,14,46)"/>
                                    <ellipse cx="46" cy="46" rx="7" ry="5" fill="#4a8c3a" stroke="#2a5c1a" strokeWidth="1.5" transform="rotate(-35,46,46)"/>
                                    <circle cx="30" cy="30" r="16" fill="#5aaa3a" stroke="#2a5c1a" strokeWidth="2"/>
                                    <ellipse cx="30" cy="30" rx="9" ry="9" fill="#3a8a2a" opacity="0.6"/>
                                    <line x1="30" y1="14" x2="30" y2="46" stroke="#2a5c1a" strokeWidth="1" opacity="0.5"/>
                                    <line x1="14" y1="30" x2="46" y2="30" stroke="#2a5c1a" strokeWidth="1" opacity="0.5"/>
                                    <ellipse cx="8" cy="30" rx="5" ry="3" fill="#4a8c3a" stroke="#2a5c1a" strokeWidth="1.5"/>
                                    <circle cx="50" cy="30" r="8" fill="#6aaa4a" stroke="#2a5c1a" strokeWidth="1.5"/>
                                    <circle cx="53" cy="27" r="2" fill="#222"/>
                                    <circle cx="53" cy="33" r="2" fill="#222"/>
                                </svg>
                            ) : spriteState.spriteType === 'arrow' ? (
                                <svg width="40" height="40" viewBox="0 0 40 40">
                                    <polygon points="20,2 38,38 20,28 2,38" fill="#333" stroke="#fff" strokeWidth="2"/>
                                </svg>
                            ) : spriteState.spriteType === 'dog' ? (
                                <svg width="80" height="80" viewBox="0 0 80 80">
                                    <ellipse cx="60" cy="35" rx="8" ry="15" fill="#8B4513" stroke="#654321" strokeWidth="1.5"/>
                                    <ellipse cx="60" cy="55" rx="8" ry="15" fill="#8B4513" stroke="#654321" strokeWidth="1.5"/>
                                    <ellipse cx="40" cy="45" rx="20" ry="18" fill="#A0522D" stroke="#654321" strokeWidth="2"/>
                                    <circle cx="65" cy="45" r="12" fill="#A0522D" stroke="#654321" strokeWidth="2"/>
                                    <circle cx="68" cy="42" r="3" fill="#222"/>
                                    <circle cx="68" cy="48" r="3" fill="#222"/>
                                    <ellipse cx="73" cy="45" rx="3" ry="2" fill="#333"/>
                                    <ellipse cx="20" cy="25" rx="6" ry="12" fill="#8B4513" stroke="#654321" strokeWidth="1.5"/>
                                    <ellipse cx="20" cy="65" rx="6" ry="12" fill="#8B4513" stroke="#654321" strokeWidth="1.5"/>
                                    <path d="M 35 60 Q 40 65 45 60" fill="none" stroke="#654321" strokeWidth="2"/>
                                </svg>
                            ) : spriteState.spriteType === 'robot' ? (
                                <svg width="70" height="70" viewBox="0 0 70 70">
                                    <rect x="20" y="10" width="30" height="8" fill="#666" stroke="#333" strokeWidth="1.5" rx="2"/>
                                    <line x1="35" y1="10" x2="35" y2="5" stroke="#666" strokeWidth="2"/>
                                    <circle cx="35" cy="4" r="2.5" fill="#ff0" stroke="#333" strokeWidth="1"/>
                                    <rect x="18" y="20" width="34" height="30" fill="#4a9eff" stroke="#2a5ecc" strokeWidth="2" rx="3"/>
                                    <circle cx="27" cy="30" r="4" fill="#0ff" stroke="#333" strokeWidth="1"/>
                                    <circle cx="43" cy="30" r="4" fill="#0ff" stroke="#333" strokeWidth="1"/>
                                    <rect x="28" y="38" width="14" height="6" fill="#333" stroke="#222" strokeWidth="1" rx="2"/>
                                    <rect x="10" y="28" width="8" height="15" fill="#4a9eff" stroke="#2a5ecc" strokeWidth="1.5" rx="2"/>
                                    <rect x="52" y="28" width="8" height="15" fill="#4a9eff" stroke="#2a5ecc" strokeWidth="1.5" rx="2"/>
                                    <rect x="23" y="50" width="8" height="16" fill="#666" stroke="#333" strokeWidth="1.5" rx="2"/>
                                    <rect x="39" y="50" width="8" height="16" fill="#666" stroke="#333" strokeWidth="1.5" rx="2"/>
                                </svg>
                            ) : spriteState.spriteType === 'ball' ? (
                                <svg width="50" height="50" viewBox="0 0 50 50">
                                    <circle cx="25" cy="25" r="20" fill="#e74c3c" stroke="#c0392b" strokeWidth="2"/>
                                    <ellipse cx="25" cy="25" rx="20" ry="10" fill="#e74c3c" opacity="0.3"/>
                                    <circle cx="18" cy="18" r="6" fill="#fff" opacity="0.5"/>
                                    <path d="M 15 25 Q 25 15 35 25 Q 25 35 15 25" fill="none" stroke="#c0392b" strokeWidth="1.5"/>
                                </svg>
                            ) : (
                                /* Default cat SVG */
                                <svg width="100" height="100" viewBox="0 0 100 100">
                                    <path d="M50 20 Q60 5 70 20 Q80 10 85 25 Q95 30 90 50 Q95 70 80 80 Q60 90 40 80 Q25 80 20 60 Q10 50 20 40 Q15 25 30 20 Q40 5 50 20 Z" fill="#ffb703" stroke="#fb8500" strokeWidth="3" />
                                    <circle cx="40" cy="40" r="5" fill="black" />
                                    <circle cx="70" cy="40" r="5" fill="black" />
                                    <path d="M50 50 Q60 60 70 50" fill="none" stroke="black" strokeWidth="3" />
                                    <path d="M20 50 L5 45 M20 55 L5 60 M90 50 L105 45 M90 55 L105 60" stroke="black" strokeWidth="2" />
                                </svg>
                            )}
                        </div>

                        {/* Speech/think bubble */}
                        {(spriteState.talking || spriteState.thinking) && (
                            <div
                                className={`bubble ${spriteState.thinking ? 'think' : 'say'}`}
                                style={{ transform: `rotate(${-(spriteState.direction - 90)}deg)` }}
                            >
                                {spriteState.talking || spriteState.thinking}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="stage-info">
                <div className="info-item">
                    <label>X</label>
                    <span>{Math.round(spriteState.x)}</span>
                </div>
                <div className="info-item">
                    <label>Y</label>
                    <span>{Math.round(spriteState.y)}</span>
                </div>
                <div className="info-item">
                    <label>Size</label>
                    <span>{spriteState.size}</span>
                </div>
                <div className="info-item">
                    <label>Dir</label>
                    <span>{Math.round(spriteState.direction)}</span>
                </div>
            </div>
        </div>
    );
};

export default Stage;
