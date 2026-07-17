import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
export const openai = apiKey ? new OpenAI({ apiKey }) : null;

export const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

/** True if AI is configured. UI/code should fall back gracefully otherwise. */
export const aiEnabled = !!openai;
