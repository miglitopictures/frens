// Ready-made word lists. To add a theme, add one entry here; it shows up in
// the setup screen automatically. Words should be easy to draw.

export const THEMES = [
  {
    id: 'animais',
    name: 'Animais',
    words: [
      'gato', 'cachorro', 'peixe', 'pássaro', 'cavalo', 'vaca', 'porco', 'galinha',
      'leão', 'tigre', 'elefante', 'girafa', 'macaco', 'cobra', 'tartaruga', 'coelho',
      'rato', 'sapo', 'borboleta', 'abelha', 'aranha', 'polvo', 'tubarão', 'baleia',
      'golfinho', 'pinguim', 'coruja', 'jacaré', 'camelo', 'zebra', 'urso', 'raposa',
      'caracol', 'formiga', 'morcego',
    ],
  },
  {
    id: 'comidas',
    name: 'Comidas',
    words: [
      'pizza', 'hambúrguer', 'banana', 'maçã', 'uva', 'melancia', 'abacaxi', 'morango',
      'sorvete', 'bolo', 'pão', 'queijo', 'ovo', 'cenoura', 'milho', 'pipoca',
      'cachorro-quente', 'sanduíche', 'chocolate', 'biscoito', 'café', 'leite', 'coxinha',
      'brigadeiro', 'tapioca', 'açaí', 'feijoada', 'sushi', 'macarrão', 'salada', 'pastel',
      'laranja', 'limão', 'coco', 'pirulito',
    ],
  },
  {
    id: 'objetos',
    name: 'Objetos',
    words: [
      'cadeira', 'mesa', 'cama', 'lâmpada', 'relógio', 'telefone', 'computador', 'televisão',
      'guarda-chuva', 'óculos', 'chave', 'tesoura', 'livro', 'lápis', 'caneta', 'mochila',
      'sapato', 'chapéu', 'camiseta', 'garrafa', 'copo', 'garfo', 'faca', 'colher',
      'panela', 'vassoura', 'escada', 'espelho', 'vela', 'violão', 'bola', 'balão',
      'câmera', 'fone de ouvido', 'controle remoto',
    ],
  },
  {
    id: 'lugares',
    name: 'Lugares',
    words: [
      'praia', 'montanha', 'escola', 'hospital', 'igreja', 'castelo', 'farol', 'ponte',
      'cidade', 'floresta', 'deserto', 'ilha', 'fazenda', 'aeroporto', 'estádio', 'cinema',
      'biblioteca', 'padaria', 'supermercado', 'parque', 'zoológico', 'piscina', 'vulcão',
      'cachoeira', 'rio', 'caverna', 'casa', 'prédio', 'rua', 'praça', 'museu', 'circo',
      'restaurante', 'planeta',
    ],
  },
  {
    id: 'profissoes',
    name: 'Profissões',
    words: [
      'médico', 'bombeiro', 'policial', 'professor', 'cozinheiro', 'astronauta', 'pintor',
      'pescador', 'piloto', 'motorista', 'dentista', 'padeiro', 'carteiro', 'jardineiro',
      'mágico', 'palhaço', 'cantor', 'fotógrafo', 'enfermeiro', 'pedreiro', 'programador',
      'cientista', 'juiz', 'garçom', 'barbeiro', 'marinheiro', 'detetive', 'músico',
      'dançarino', 'agricultor',
    ],
  },
  {
    id: 'esportes',
    name: 'Esportes e brincadeiras',
    words: [
      'futebol', 'vôlei', 'basquete', 'tênis', 'natação', 'surfe', 'skate', 'bicicleta',
      'boxe', 'xadrez', 'pipa', 'pião', 'amarelinha', 'esconde-esconde', 'corrida', 'golfe',
      'judô', 'capoeira', 'patins', 'pescaria', 'videogame', 'dominó', 'boliche', 'ioga',
      'escalada',
    ],
  },
  {
    id: 'natureza',
    name: 'Natureza',
    words: [
      'sol', 'lua', 'estrela', 'nuvem', 'chuva', 'arco-íris', 'raio', 'neve', 'árvore',
      'flor', 'folha', 'cacto', 'cogumelo', 'pedra', 'onda', 'vento', 'fogo', 'terremoto',
      'furacão', 'gelo', 'grama', 'semente', 'galho', 'coqueiro', 'girassol',
    ],
  },
]

// "Pão " -> "pao": lowercase, no accents, single spaces. Used to compare guesses.
export function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// How many single-letter edits turn `a` into `b` (Levenshtein distance).
// Used for "Está perto!".
export function editDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[b.length]
}

// Parses the host's custom words: one per line or separated by commas.
export function parseCustomWords(text) {
  const words = (text || '')
    .split(/[,\n]/)
    .map((w) => w.trim().replace(/\s+/g, ' '))
    .filter((w) => w.length >= 2 && w.length <= 30)
  return [...new Set(words)]
}
