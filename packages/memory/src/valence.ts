// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SentimentIntensityAnalyzer } = require("crowd-sentiment");

export interface ValenceResult {
  valence: number; // -1.0 to +1.0
  arousal: number; // 0.0 to 1.0
  source: "local" | "llm";
}

export interface ValenceScorer {
  score(text: string): Promise<ValenceResult>;
}

export type LLMCallFn = (prompt: string) => Promise<string>;

// --- Domain pattern overrides ---

const CORRECTION_PATTERNS = [
  /\bno[,.]?\s+(that'?s?\s+)?wrong\b/i,
  /\btry\s+again\b/i,
  /\bi\s+told\s+you\b/i,
  /\byou\s+(were|are)\s+wrong\b/i,
  /\bthat'?s\s+(incorrect|wrong|not\s+right)\b/i,
  /\bstop\s+(doing|saying)\b/i,
];

const PRAISE_PATTERNS = [
  /\bperfect\b/i,
  /\bgreat\s+job\b/i,
  /\bwell\s+done\b/i,
  /\bexcellent\b/i,
  /\bbravo\b/i,
  /\bthank\s+you\b/i,
  /\bthanks\b/i,
];

const SURPRISE_PATTERNS = [/\bwow\b/i, /\boh\s+my\b/i, /\bunbelievable\b/i, /\bincredible\b/i];

// Intensity adverbs that drive up arousal
const INTENSITY_ADVERBS = [
  "absolutely",
  "completely",
  "totally",
  "utterly",
  "extremely",
  "incredibly",
  "really",
  "very",
  "highly",
  "terribly",
  "awfully",
  "horribly",
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute arousal from punctuation density, ALL CAPS ratio, and intensity adverbs.
 * Returns a value in [0, 1].
 */
function computeArousal(text: string): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const totalWords = Math.max(words.length, 1);

  // Exclamation/question mark density
  const exclamCount = (text.match(/!/g) || []).length;
  const questionCount = (text.match(/\?/g) || []).length;
  const punctScore = Math.min((exclamCount * 0.15 + questionCount * 0.1), 0.5);

  // ALL CAPS ratio (words >= 2 chars that are all uppercase)
  const capsWords = words.filter((w) => w.length >= 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  const capsRatio = capsWords.length / totalWords;
  const capsScore = Math.min(capsRatio * 0.8, 0.4);

  // Intensity adverb count
  const textLower = text.toLowerCase();
  let adverbCount = 0;
  for (const adverb of INTENSITY_ADVERBS) {
    const re = new RegExp(`\\b${adverb}\\b`, "gi");
    const matches = textLower.match(re);
    if (matches) adverbCount += matches.length;
  }
  const adverbScore = Math.min(adverbCount * 0.1, 0.3);

  const raw = punctScore + capsScore + adverbScore;
  return clamp(raw, 0, 1);
}

export class LocalValenceScorer implements ValenceScorer {
  async score(text: string): Promise<ValenceResult> {
    // Layer 1: VADER base valence
    const scores = SentimentIntensityAnalyzer.polarity_scores(text) as {
      compound: number;
      pos: number;
      neg: number;
      neu: number;
    };
    let valence: number = scores.compound; // already in [-1, 1]

    // Layer 2: Arousal heuristic
    let arousal = computeArousal(text);

    // Layer 3: Domain pattern overrides
    const isCorrectionMatch = CORRECTION_PATTERNS.some((p) => p.test(text));
    const isPraiseMatch = PRAISE_PATTERNS.some((p) => p.test(text));
    const isSurpriseMatch = SURPRISE_PATTERNS.some((p) => p.test(text));

    if (isCorrectionMatch) {
      // Force negative and boost arousal
      valence = Math.min(valence, -0.3);
      arousal = Math.max(arousal, 0.5);
    }

    if (isPraiseMatch) {
      // Force positive, blend with vader
      valence = Math.max(valence, 0.3);
    }

    if (isSurpriseMatch) {
      // Boost arousal for surprise
      arousal = Math.max(arousal, 0.4);
    }

    return {
      valence: clamp(valence, -1, 1),
      arousal: clamp(arousal, 0, 1),
      source: "local",
    };
  }
}

export class LLMValenceScorer implements ValenceScorer {
  constructor(private readonly llmCall: LLMCallFn) {}

  async score(text: string): Promise<ValenceResult> {
    const prompt = `You are an affect-scoring assistant. Given the following text, return ONLY a JSON object with two fields:
- "valence": a float from -1.0 (very negative) to +1.0 (very positive)
- "arousal": a float from 0.0 (calm) to 1.0 (highly activated/intense)

Text: "${text}"

Respond with ONLY valid JSON, no explanation. Example: {"valence": 0.3, "arousal": 0.6}`;

    try {
      const response = await this.llmCall(prompt);
      // Extract JSON from the response (handle potential surrounding text)
      const jsonMatch = response.match(/\{[^}]*\}/);
      if (!jsonMatch) {
        return this.neutral();
      }
      const parsed = JSON.parse(jsonMatch[0]) as { valence?: unknown; arousal?: unknown };
      if (typeof parsed.valence !== "number" || typeof parsed.arousal !== "number") {
        return this.neutral();
      }
      return {
        valence: clamp(parsed.valence, -1, 1),
        arousal: clamp(parsed.arousal, 0, 1),
        source: "llm",
      };
    } catch {
      return this.neutral();
    }
  }

  private neutral(): ValenceResult {
    return { valence: 0, arousal: 0.5, source: "llm" };
  }
}
