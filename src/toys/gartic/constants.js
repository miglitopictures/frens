// All the numbers of the game in one place, so they are easy to tweak.

// The drawing uses a fixed "logical" size. Every screen scales it,
// so a point (400, 300) is the center for everyone.
export const CANVAS_W = 800
export const CANVAS_H = 600

export const COLORS = ['#1a1a1a', '#e4572e', '#3a86ff', '#4c956c', '#f3a712']
export const ERASER = '#ffffff' // the eraser just paints with the background color
export const SIZES = [4, 10, 24]

export const ROUND_OPTIONS = [1, 2, 3, 4, 5]
export const DEFAULT_ROUNDS = 3
export const DRAW_TIME_OPTIONS = [60, 80, 100, 120] // seconds
export const DEFAULT_DRAW_TIME = 80
export const BETWEEN_TURNS = 3 // seconds showing "end of turn"

export const SEND_STROKE_EVERY_MS = 33 // the drawer sends its points ~30x per second
