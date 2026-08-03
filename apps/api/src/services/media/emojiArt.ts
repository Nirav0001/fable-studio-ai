import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../../config/env";
import { createLogger } from "../../lib/logger";

const log = createLogger("emoji-art");

/**
 * Option artwork for the VoteVerse-style split renders: each option gets a big
 * emoji rendered from Google's Noto Emoji PNG set (512px, Apache-2.0), fetched
 * once and cached under storage/emoji. Offline or fetch failure → null and the
 * render simply skips the artwork layer.
 */

const KEYWORDS: [RegExp, string][] = [
  [/subscribe|bell/i, "🔔"],
  [/\blike\b|thumbs/i, "👍"],
  [/pizza/i, "🍕"],
  [/burger/i, "🍔"],
  [/chicken|wing/i, "🍗"],
  [/steak|beef|meat/i, "🥩"],
  [/bacon/i, "🥓"],
  [/sausage/i, "🌭"],
  [/chocolate|candy|sweet/i, "🍫"],
  [/cheese/i, "🧀"],
  [/coffee/i, "☕"],
  [/tea\b/i, "🍵"],
  [/ice.?cream/i, "🍦"],
  [/taco/i, "🌮"],
  [/sushi/i, "🍣"],
  [/fries|chips/i, "🍟"],
  [/pasta|noodle/i, "🍝"],
  [/fruit|apple/i, "🍎"],
  [/vegetable|broccoli|salad/i, "🥦"],
  [/spicy|hot sauce|chilli|chili/i, "🌶️"],
  [/lunch|meal|dinner|food|eat/i, "🍽️"],
  [/mystery/i, "🎁"],
  [/dog|puppy/i, "🐶"],
  [/cat|kitten/i, "🐱"],
  [/shark/i, "🦈"],
  [/lion/i, "🦁"],
  [/bear/i, "🐻"],
  [/spider/i, "🕷️"],
  [/snake/i, "🐍"],
  [/dragon/i, "🐉"],
  [/horse/i, "🐴"],
  [/bird|parrot/i, "🦜"],
  [/fish/i, "🐟"],
  [/monkey/i, "🐒"],
  [/elephant/i, "🐘"],
  [/talk.*animal|animal.*talk/i, "💬"],
  [/money|cash|salary|paid|pay\b/i, "💰"],
  [/million|billion|rich|wealth/i, "🤑"],
  [/bank/i, "🏦"],
  [/gold\b/i, "🏅"],
  [/diamond/i, "💎"],
  [/credit|card/i, "💳"],
  [/fly|flight|flying/i, "🕊️"],
  [/invisib/i, "👻"],
  [/teleport/i, "🌀"],
  [/mind|thought|brain|read.*mind/i, "🧠"],
  [/time.*(travel|stop|rewind)|rewind/i, "⏳"],
  [/strength|strong|muscle/i, "💪"],
  [/speed|fast|run/i, "⚡"],
  [/heal/i, "✨"],
  [/future/i, "🔮"],
  [/past\b/i, "🕰️"],
  [/movie|film|cinema/i, "🎬"],
  [/popcorn/i, "🍿"],
  [/superhero|hero|marvel/i, "🦸"],
  [/villain/i, "🦹"],
  [/star wars|space|galaxy|alien/i, "👽"],
  [/horror|scary/i, "😱"],
  [/comedy|funny|laugh|joke/i, "😂"],
  [/music|song|sing/i, "🎤"],
  [/dance/i, "🕺"],
  [/game|gaming|console|controller/i, "🎮"],
  [/pc\b|computer|keyboard/i, "🖥️"],
  [/minecraft|build/i, "⛏️"],
  [/lag\b|wifi|internet/i, "📶"],
  [/football|soccer/i, "⚽"],
  [/basketball/i, "🏀"],
  [/tennis/i, "🎾"],
  [/golf/i, "⛳"],
  [/boxing|fight/i, "🥊"],
  [/swim/i, "🏊"],
  [/gym|workout/i, "🏋️"],
  [/trophy|win|champion/i, "🏆"],
  [/school|class|teacher/i, "🏫"],
  [/homework|exam|test/i, "📝"],
  [/book|read/i, "📚"],
  [/backpack/i, "🎒"],
  [/holiday|vacation|travel/i, "🧳"],
  [/beach|island/i, "🏝️"],
  [/plane|airport/i, "✈️"],
  [/mountain|hik/i, "🏔️"],
  [/city\b/i, "🌆"],
  [/hotel/i, "🏨"],
  [/cruise|boat|yacht/i, "🛥️"],
  [/mansion|house|home/i, "🏠"],
  [/castle/i, "🏰"],
  [/car\b|ferrari|lambo|supercar/i, "🏎️"],
  [/watch\b|rolex/i, "⌚"],
  [/designer|fashion|clothes/i, "👔"],
  [/phone|iphone/i, "📱"],
  [/battery/i, "🔋"],
  [/famous|fame|celebrity/i, "🌟"],
  [/sleep|nap|bed/i, "😴"],
  [/shower|bath|clean/i, "🚿"],
  [/toilet/i, "🚽"],
  [/rain|weather|storm/i, "⛈️"],
  [/sun\b|summer/i, "☀️"],
  [/winter|snow|cold|freez/i, "❄️"],
  [/fire|burn|hot\b/i, "🔥"],
  [/secret|never tell/i, "🤫"],
  [/friend/i, "🧑‍🤝‍🧑"],
  [/forever|life\b|always/i, "♾️"],
  [/luck/i, "🍀"],
  [/sing.*shower/i, "🎤"],
  [/chore/i, "🧹"],
  [/argu/i, "🗣️"],
];

/** Distinct A/B fallback pairs per theme so both halves never repeat. */
const THEME_FALLBACK: Record<string, [string, string]> = {
  food: ["🍕", "🍔"],
  animals: ["🐶", "🐱"],
  money: ["💰", "💎"],
  superpowers: ["⚡", "🦸"],
  movies: ["🎬", "🍿"],
  gaming: ["🎮", "🕹️"],
  sports: ["⚽", "🏀"],
  school: ["🎒", "📚"],
  travel: ["✈️", "🏝️"],
  luxury: ["💎", "🛥️"],
  general: ["🤔", "😅"],
  funny: ["😂", "🤪"],
  random: ["🎲", "✨"],
};

export function pickEmoji(optionText: string, theme: string, slot: 0 | 1): string {
  for (const [pattern, emoji] of KEYWORDS) {
    if (pattern.test(optionText)) return emoji;
  }
  const pair = THEME_FALLBACK[theme] ?? THEME_FALLBACK.general;
  return pair[slot];
}

/** Noto PNG filenames drop variation selectors: emoji_u1f355.png, emoji_u23f3.png … */
function notoName(emoji: string): string {
  const codes = [...emoji]
    .map((ch) => ch.codePointAt(0) ?? 0)
    .filter((cp) => cp !== 0xfe0f)
    .map((cp) => cp.toString(16));
  return `emoji_u${codes.join("_")}.png`;
}

const inFlight = new Map<string, Promise<string | null>>();

/** Resolve an emoji to a cached local 512px PNG path (null when unavailable). */
export async function emojiPng(emoji: string): Promise<string | null> {
  const name = notoName(emoji);
  const cacheDir = join(env.storageDir, "emoji");
  const local = join(cacheDir, name);

  try {
    const s = await stat(local);
    if (s.size > 500) return local;
  } catch {
    /* not cached yet */
  }

  const existing = inFlight.get(name);
  if (existing) return existing;

  const task = (async (): Promise<string | null> => {
    try {
      await mkdir(cacheDir, { recursive: true });
      const url = `https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/png/512/${name}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 500) throw new Error("suspiciously small file");
      await writeFile(local, buf);
      return local;
    } catch (err) {
      log.warn(`emoji ${emoji} (${name}) unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      inFlight.delete(name);
    }
  })();
  inFlight.set(name, task);
  return task;
}

/** Artwork for one option: keyword-matched emoji → cached PNG path. */
export async function optionArt(
  optionText: string,
  theme: string,
  slot: 0 | 1,
): Promise<string | null> {
  return emojiPng(pickEmoji(optionText, theme, slot));
}
