export interface ImportanceInput {
  /** Base weight assigned at memory creation (0–1) */
  baseWeight: number;
  /** Recency factor: 1.0 = just now, decays toward 0 over time */
  recencyFactor: number;
  /** Number of times this memory has been referenced */
  refCount: number;
  /** Outcome signal: positive = success, negative = failure, 0 = neutral */
  outcomeSignal: number;
  /** Whether this memory records a correction */
  isCorrection: boolean;
  /** Absolute valence magnitude (0-1). High = emotionally significant. */
  valenceMagnitude?: number;
}

// Configurable weights
const W_BASE = 1.0;
const W_RECENCY = 0.8;
const W_REFS = 0.5;
const W_OUTCOME = 0.6;
const W_CORRECTION = 1.2;
const W_VALENCE = 0.9;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Compute importance score for a memory entry.
 * Returns a value between 0 and 1.
 *
 * Formula: sigmoid(
 *   w_base × base_weight
 * + w_recency × recency_factor
 * + w_refs × log₂(ref_count + 1)
 * + w_outcome × |outcome_signal|
 * + w_correction × is_correction
 * + w_valence × valence_magnitude
 * )
 *
 * Note: |outcome_signal| — both success and failure are valuable.
 */
export function computeImportance(input: ImportanceInput): number {
  const {
    baseWeight,
    recencyFactor,
    refCount,
    outcomeSignal,
    isCorrection,
    valenceMagnitude,
  } = input;

  const score =
    W_BASE * baseWeight +
    W_RECENCY * recencyFactor +
    W_REFS * Math.log2(refCount + 1) +
    W_OUTCOME * Math.abs(outcomeSignal) +
    W_CORRECTION * (isCorrection ? 1 : 0) +
    W_VALENCE * (valenceMagnitude ?? 0);

  return sigmoid(score);
}
