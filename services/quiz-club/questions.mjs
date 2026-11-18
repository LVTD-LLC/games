import { randomUUID } from 'node:crypto';
import { fallbackDeck, shuffle, topics } from './bank.mjs';

export const model = 'google/gemma-4-31b-it:free';
export function parseDeck(content, { topic, lang }) {
  const { questions } = JSON.parse(content);
  if (!Array.isArray(questions) || questions.length !== 10)
    throw Error('question count');
  const seen = new Set();
  const text = (s, max) =>
    typeof s === 'string' && s.trim().length > 0 && s.length <= max;
  return questions.map((q) => {
    if (
      !q ||
      !topics.includes(q.topic) ||
      (topic !== 'mixed' && q.topic !== topic) ||
      !text(q.prompt, 250) ||
      (lang === 'ru' && !/[А-Яа-яЁё]/.test(q.prompt)) ||
      (lang === 'en' && !/[a-z]/i.test(q.prompt)) ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      !q.options.every((s) => text(s, 96)) ||
      new Set(q.options.map((s) => s.trim().toLowerCase())).size !== 4 ||
      !Number.isInteger(q.correct) ||
      q.correct < 0 ||
      q.correct > 3
    )
      throw Error('invalid card');
    const prompt = q.prompt.trim(),
      key = prompt.toLowerCase();
    if (seen.has(key)) throw Error('duplicate');
    seen.add(key);
    const order = shuffle([0, 1, 2, 3]);
    return {
      topic: q.topic,
      prompt,
      options: order.map((i) => q.options[i].trim()),
      correct: order.indexOf(q.correct),
    };
  });
}
export function createQuestionSource({
  apiKey = process.env.OPENROUTER_API_KEY,
  fetcher = fetch,
  timeout = 18000,
} = {}) {
  let pending = 0,
    calls = 0,
    windowEnd = 0;
  return async (settings) => {
    if (Date.now() >= windowEnd) {
      calls = 0;
      windowEnd = Date.now() + 86400000;
    }
    if (!apiKey || pending >= 3 || calls >= 50)
      return { deck: fallbackDeck(settings), source: 'bank' };
    calls++;
    pending++;
    try {
      const { lang, topic } = settings;
      const response = await fetcher(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          signal: AbortSignal.timeout(timeout),
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            models: [model, 'openrouter/free'],
            provider: { max_price: { prompt: 0, completion: 0 } },
            temperature: 0.85,
            max_tokens: 2400,
            reasoning: { enabled: false },
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'Write a lively family-friendly multiplayer trivia round. Use only stable and unambiguous facts you know well. Vary question styles and difficulty. Each question must have exactly one correct answer and three credible distractors. Avoid disputed facts, current events, trick questions, and all/none of the above. Return JSON only.',
              },
              {
                role: 'user',
                content: `Write exactly ten distinct questions in ${lang === 'ru' ? 'natural Russian' : 'English'}, including all options in that language. Topic: ${topic === 'mixed' ? 'mix art, geography and numbers with at least two of each' : topic}. Numbers includes mental arithmetic, geometry and patterns. Return {"questions":[{"topic":"art|geography|numbers","prompt":"...","options":["...","...","...","..."],"correct":0}]} using one topic ID per question and zero-based correct indices. Variation seed: ${randomUUID()}.`,
              },
            ],
          }),
        },
      );
      if (!response.ok) throw Error('provider unavailable');
      const result = await response.json();
      return {
        deck: parseDeck(result.choices[0].message.content, settings),
        source: 'openrouter',
      };
    } catch {
      return { deck: fallbackDeck(settings), source: 'bank' };
    } finally {
      pending--;
    }
  };
}
