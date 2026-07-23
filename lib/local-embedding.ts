export const LOCAL_EMBEDDING_DIMENSIONS = 512;

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function addToken(vector: number[], token: string, weight: number): void {
  if (!token) return;
  vector[hashToken(token) % LOCAL_EMBEDDING_DIMENSIONS] += weight;
}

/**
 * A deterministic keyword vector used when the selected provider has no
 * embedding endpoint. Documents and queries use the same representation.
 */
export function createKeywordEmbedding(text: string): number[] {
  const vector = Array.from({ length: LOCAL_EMBEDDING_DIMENSIONS }, () => 0);
  const normalized = text.toLowerCase();

  for (const word of normalized.match(/[a-z0-9][a-z0-9_-]*/g) || []) {
    addToken(vector, `word:${word}`, 2);
  }

  const chineseCharacters = Array.from(normalized).filter((character) => /[\u3400-\u9fff]/.test(character));
  for (let index = 0; index < chineseCharacters.length; index += 1) {
    addToken(vector, `char:${chineseCharacters[index]}`, 0.25);
    if (index + 1 < chineseCharacters.length) {
      addToken(vector, `pair:${chineseCharacters[index]}${chineseCharacters[index + 1]}`, 1);
    }
  }

  return vector;
}

export function createKeywordEmbeddings(texts: string[]): number[][] {
  return texts.map(createKeywordEmbedding);
}
