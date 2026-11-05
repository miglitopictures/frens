// The FRENS logo, drawn as a grid of rounded pixels (one <span> per pixel).
// Each letter gets one player color, in order: coral, sky, amber, mint, violet.

// 5 x 7 glyphs. '1' = pixel on.
const GLYPHS = {
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
}

// pixel:   size of one pixel in CSS px
// animate: true = each pixel pops in, in a left-to-right wave (used by the boot)
export function pixelLogo(text, { pixel = 8, animate = false } = {}) {
  const logo = document.createElement('div')
  logo.className = 'pixel-logo'
  logo.setAttribute('role', 'img')
  logo.setAttribute('aria-label', text)

  const columns = text.length * 6 - 1 // 5 columns per letter + 1 empty between letters
  logo.style.gridTemplateColumns = `repeat(${columns}, ${pixel}px)`
  logo.style.gridTemplateRows = `repeat(7, ${pixel}px)`
  logo.style.gap = Math.max(1, Math.round(pixel / 7)) + 'px'

  ;[...text].forEach((letter, i) => {
    const rows = GLYPHS[letter]
    if (!rows) return
    rows.forEach((row, y) => {
      ;[...row].forEach((bit, x) => {
        if (bit !== '1') return
        const column = i * 6 + x + 1
        const px = document.createElement('span')
        px.className = animate ? 'px pop' : 'px'
        px.style.gridColumn = column
        px.style.gridRow = y + 1
        px.style.background = `var(--p${(i % 6) + 1})`
        if (animate) {
          px.style.animationDelay = Math.round(column * 22 + Math.random() * 120) + 'ms'
        }
        logo.append(px)
      })
    })
  })

  return logo
}
