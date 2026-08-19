/** pgvector's text input format for a vector literal, e.g. "[0.1,0.2,0.3]". */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
