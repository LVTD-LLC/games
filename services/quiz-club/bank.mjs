import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';

function rows(name) {
  return readFileSync(
    new URL('./data/' + name + '.tsv', import.meta.url),
    'utf8',
  )
    .trimEnd()
    .split('\n')
    .map((line) => line.split('\t'));
}
const paintings = rows('paintings');
const places = rows('places');
export const topics = ['art', 'geography', 'numbers'];
export const bankSizes = {
  art: paintings.length,
  geography: places.length,
  numbers: 2400,
};

export function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const regions = Object.fromEntries(
  ['en', 'ru'].map((lang) => [
    lang,
    new Intl.DisplayNames(lang, { type: 'region' }),
  ]),
);
function choices(prompt, answer, others, topic) {
  const options = shuffle([
    answer,
    ...[...new Set(others)].filter((v) => v !== answer).slice(0, 3),
  ]);
  return { topic, prompt, options, correct: options.indexOf(answer) };
}
function numbers(id, ru) {
  const n = Math.floor(id / 8),
    a = 3 + (n % 25),
    b = 2 + Math.floor(n / 25);
  switch (id % 8) {
    case 0:
      return [
        ru
          ? `Сколько будет ${b * 5}% от ${a * 20}?`
          : `What is ${b * 5}% of ${a * 20}?`,
        a * b,
      ];
    case 1:
      return [
        ru
          ? `Прямоугольник со сторонами ${a} и ${b} см. Какова его площадь в см²?`
          : `A rectangle is ${a} cm wide and ${b} cm tall. What is its area in cm²?`,
        a * b,
      ];
    case 2:
      return [
        ru
          ? `Какое число дальше, если шаг постоянный: ${a}, ${a + b}, ${a + 2 * b}, …?`
          : `Continue the sequence using the same step: ${a}, ${a + b}, ${a + 2 * b}, …?`,
        a + 3 * b,
      ];
    case 3:
      return [
        ru
          ? `Сколько минут в ${b} ч ${a} мин?`
          : `How many minutes are in ${b} h ${a} min?`,
        60 * b + a,
      ];
    case 4:
      return [
        ru
          ? `Среднее арифметическое чисел ${2 * a} и ${2 * b + 1}?`
          : `What is the average of ${2 * a} and ${2 * b + 1}?`,
        a + b + 0.5,
      ];
    case 5:
      return [
        ru
          ? `Если x × ${b} + 1 = ${a * b + 1}, чему равен x?`
          : `If x × ${b} + 1 = ${a * b + 1}, what is x?`,
        a,
      ];
    case 6:
      return [
        ru
          ? `На каждой из ${b} полок по ${a} книг. Сколько книг останется, если взять одну?`
          : `There are ${a} books on each of ${b} shelves. How many remain if you take one book?`,
        a * b - 1,
      ];
    default:
      return [
        ru
          ? `Сколько сантиметров в ленте длиной ${b} м и ${a} см?`
          : `A ribbon measures ${b} m and ${a} cm. How many centimetres is that?`,
        100 * b + a,
      ];
  }
}

export function bankQuestion(topic, id, lang) {
  const ru = lang === 'ru',
    col = ru ? 1 : 0;
  if (topic === 'numbers') {
    const [prompt, value] = numbers(id, ru);
    const fmt = new Intl.NumberFormat(lang);
    const offsets = shuffle([1, 2, 3, 4, -1, -2, 5, 10]).filter(
      (d) => value + d >= 0,
    );
    return choices(
      prompt,
      fmt.format(value),
      offsets.map((d) => fmt.format(value + d)),
      topic,
    );
  }
  if (topic === 'art') {
    const row = paintings[id],
      artist = row[2 + col];
    const others = shuffle(paintings).map((r) => r[2 + col]);
    return choices(
      ru ? `Кто автор картины «${row[col]}»?` : `Who painted “${row[col]}”?`,
      artist,
      others,
      topic,
    );
  }
  const row = places[id],
    country = regions[lang].of(row[2]);
  const others = shuffle(countryCodes).map((c) => regions[lang].of(c));
  return choices(
    ru
      ? `В какой стране находится город ${row[col]}?`
      : `Which country is home to the city of ${row[col]}?`,
    country,
    others,
    topic,
  );
}
const countryCodes = [...new Set(places.map((row) => row[2]))];
export function fallbackDeck({ topic, lang }) {
  const order = topic === 'mixed' ? shuffle(topics) : [topic];
  const seen = new Set(),
    cards = [];
  while (cards.length < 10) {
    const category = order[cards.length % order.length],
      id = randomInt(bankSizes[category]);
    const key = category + id;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(bankQuestion(category, id, lang));
  }
  return cards;
}
