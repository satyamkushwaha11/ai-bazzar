import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY?.trim();

/**
 * Module-scope construction, so a throw here fails `next build` rather than
 * just the AI features. Callers already handle `null` everywhere (search falls
 * back to keywords, the assistant returns 503), so degrade instead of crash.
 */
function makeOpenAI(): OpenAI | null {
  if (!apiKey) return null;
  try {
    return new OpenAI({ apiKey });
  } catch (err) {
    console.warn('[openai] could not initialise, AI features DISABLED:', err);
    return null;
  }
}

export const openai = makeOpenAI();

export const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

/** True if AI is configured. UI/code should fall back gracefully otherwise. */
export const aiEnabled = !!openai;
