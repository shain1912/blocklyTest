import React, { useEffect, useState, useRef } from 'react';
import './Stage.css';

const Stage = ({ isRunning }) => {
    const [spriteState, setSpriteState] = useState({
        x: 0,
        y: 0,
        direction: 90,
        size: 100,
        visible: true,
        talking: null, // text or null
        thinking: null // text or null
    });

    const spriteStateRef = useRef(spriteState);
    const keysPressed = useRef({});
    const mousePos = useRef({ x: 0, y: 0 });
    const isMouseDown = useRef(false);
    const timerStart = useRef(Date.now());

    // Update ref when state changes so controller can access latest state
    useEffect(() => {
        spriteStateRef.current = spriteState;
    }, [spriteState]);

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
                console.log(`Moved ${steps} steps`);
                setSpriteState(prev => {
                    const rad = (prev.direction - 90) * (Math.PI / 180);
                    return {
                        ...prev,
                        x: prev.x + Math.cos(rad) * steps,
                        y: prev.y + Math.sin(rad) * steps
                    };
                });
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
                setSpriteState(prev => ({ ...prev, x: Number(x) }));
                await new Promise(r => setTimeout(r, 16));
            },
            setY: async (y) => {
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
            switchCostume: async (costume) => { console.log('Costume switched to', costume); },
            nextCostume: async () => { console.log('Next costume'); },

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

            reset: () => {
                setSpriteState({
                    x: 0, y: 0, direction: 90, size: 100, visible: true, talking: null, thinking: null
                });
                timerStart.current = Date.now();
            }
        };

        return () => {
            delete window.spriteController;
        };
    }, []);

    return (
        <div className="stage-container">
            <div className="stage-header">
                <h2>Stage</h2>
                <div className="stage-controls">
                    <button className="icon-btn" title="Grid">#</button>
                    <button className="icon-btn" title="Fullscreen">⛶</button>
                </div>
            </div>
            <div className="stage-canvas">
                {spriteState.visible && (
                    <div
                        className="sprite"
                        style={{
                            transform: `translate(${spriteState.x}px, ${-spriteState.y}px) rotate(${spriteState.direction - 90}deg) scale(${spriteState.size / 100})`,
                        }}
                    >
                        <div className="sprite-image">
                            {/* Simple Cat SVG */}
                            <svg width="100" height="100" viewBox="0 0 100 100">
                                <path d="M50 20 Q60 5 70 20 Q80 10 85 25 Q95 30 90 50 Q95 70 80 80 Q60 90 40 80 Q25 80 20 60 Q10 50 20 40 Q15 25 30 20 Q40 5 50 20 Z" fill="#ffb703" stroke="#fb8500" strokeWidth="3" />
                                <circle cx="40" cy="40" r="5" fill="black" />
                                <circle cx="70" cy="40" r="5" fill="black" />
                                <path d="M50 50 Q60 60 70 50" fill="none" stroke="black" strokeWidth="3" />
                                <path d="M20 50 L5 45 M20 55 L5 60 M90 50 L105 45 M90 55 L105 60" stroke="black" strokeWidth="2" />
                            </svg>
                        </div>

                        {/* Bubble */}
                        {(spriteState.talking || spriteState.thinking) && (
                            <div
                                className={`bubble ${spriteState.thinking ? 'think' : 'say'}`}
                                style={{ transform: `rotate(${-(spriteState.direction - 90)}deg)` }} // Counter-rotate bubble
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
