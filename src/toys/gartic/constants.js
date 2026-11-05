// All the numbers of the game in one place, so they are easy to tweak.

// The drawing board, in FR-6 screen pixels. Stroke points use these coordinates,
// so a point (200, 150) is the center for everyone.
export const BOARD_W = 400
export const BOARD_H = 300

// Gartic's 16 colors, picked from the FR-6 palette.
export const COLORS = [
  'black', 'slate', 'silver', 'brown',
  'red', 'coral', 'orange', 'amber',
  'cream', 'green', 'mint', 'teal',
  'blue', 'sky', 'purple', 'pink',
]
export const PAPER = 'paper' // the board color; the eraser paints with it
export const SIZES = [1, 3, 8] // brush sizes in pixels: small, medium, big

export const ROUND_OPTIONS = [1, 2, 3, 4, 5]
export const DEFAULT_ROUNDS = 3
export const DRAW_TIME_OPTIONS = [60, 80, 100, 120] // seconds
export const DEFAULT_DRAW_TIME = 80
export const BETWEEN_TURNS = 4 // seconds showing "the word was..."
export const CHOOSE_TIME = 10 // seconds for the drawer to pick a word (then random)
export const WORD_CHOICES = 3

// Hints: reveal one more letter when this much of the time has passed.
export const HINT_AT = [0.5, 0.75]

// Points for guessing: 1st, 2nd, 3rd, 4th... everyone after gets MIN_POINTS.
export const GUESS_POINTS = [10, 8, 7, 6]
export const MIN_POINTS = 5
export const DRAWER_POINTS = 2 // for each player who guessed the drawing

export const MAX_CHAT_LENGTH = 80

export const SEND_STROKE_EVERY_MS = 33 // the drawer sends its points ~30x per second
