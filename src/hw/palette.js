// The FR-6 palette: the only 32 colors a toy may use. See docs/STYLEGUIDE.md.
// Toys refer to colors by name: PALETTE.coral, PALETTE.paper...

export const PALETTE = {
  black: '#0b0c10',
  ink: '#262833',
  slate: '#4a4e5e',
  gray: '#7d8296',
  silver: '#b9bdcb',
  paper: '#f4f1e8',

  wine: '#5c1f2e',
  red: '#c23b3b',
  coral: '#ff6b57',
  peach: '#ffb3a0',

  bark: '#4a2c22',
  brown: '#8a5233',
  orange: '#d98a4a',
  sand: '#ffd3a1',

  amber: '#ffc23d',
  cream: '#fff1a8',

  forest: '#1f3d2c',
  green: '#3f7d4a',
  mint: '#4fd6a0',
  lime: '#b8f0a8',

  deepteal: '#134a4f',
  teal: '#2a9d8f',

  navy: '#172440',
  blue: '#2856a8',
  sky: '#4fb3ff',
  ice: '#b8e4ff',

  night: '#2e2048',
  purple: '#6a4fc2',
  violet: '#a78bfa',

  plum: '#8a2b6b',
  pink: '#ff7eb6',
  blush: '#ffc4dc',
}

// Player colors in join order. Player 1 is always coral, player 2 sky, etc.
export const PLAYER_COLORS = ['coral', 'sky', 'amber', 'mint', 'violet', 'pink']

export function playerColor(index) {
  return PALETTE[PLAYER_COLORS[index % PLAYER_COLORS.length]]
}
