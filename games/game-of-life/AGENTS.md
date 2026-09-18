# Game of Life browser

This standalone Vite package is a canvas and controls for the native Bend service.
Simulation belongs in `services/life-engine/bend/`, not browser JavaScript.
Maintain desktop/mobile layout, keyboard editing, and play/pause behavior.
Invalidate pending results on reset, pattern changes, drawing, and pause.
Keep the current board usable after backend failure and hide internal service URLs.
