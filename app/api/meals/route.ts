import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Accept either ANTHROPIC_API_KEY (SDK standard) or Claude_API_Key (user-named).
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.Claude_API_Key || process.env.CLAUDE_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

type Member = { name: string; isKid?: boolean; age?: number; dietaryFilters?: string[]; allergies?: string[]; dislikes?: string[] };
type Item = { name: string; qty: number; unit: string; expiry?: string };

function describeMembers(members: Member[] | undefined) {
  if (!members?.length) return 'none';
  return members.map(m => {
    let desc = m.name;
    if (m.age != null) desc += ` (age ${m.age})`;
    else if (m.isKid) desc += ' (child)';
    if (m.dietaryFilters?.length) desc += ': ' + m.dietaryFilters.join(', ');
    if (m.allergies?.length) desc += ', allergic to: ' + m.allergies.join(', ');
    if (m.dislikes?.length) desc += ', dislikes: ' + m.dislikes.join(', ');
    return desc;
  }).join('; ');
}

function describeItems(items: Item[] | undefined) {
  return (items || []).map(i => {
    const daysLeft = i.expiry
      ? Math.ceil((new Date(i.expiry).getTime() - Date.now()) / 86400000)
      : 99;
    return `${i.name} (${i.qty}${i.unit}, expires in ${daysLeft}d)`;
  }).join(', ');
}

const SLOT_GUIDE: Record<string, string> = {
  breakfast: 'BREAKFAST: morning dishes ONLY — oats/porridge, eggs (omelette/scrambled/poached/bhurji), pancakes, paratha, idli, dosa, upma, poha, smoothie bowls, toast, yogurt parfaits, fruit bowls, breakfast wraps. NEVER suggest curries, biryani, dal-rice, full mains, or heavy stir-fries here.',
  lunch:     'LUNCH: midday meals — rice bowls, roti + sabzi, sandwiches, wraps, salads with protein, pasta, light curries with rice, khichdi, fried rice, noodle bowls, grain bowls. Filling but not as heavy as dinner.',
  snack:     'SNACK: small bites only (target under 250 kcal) — chai + biscuits, masala peanuts, fruit + yogurt, samosa, pakora, hummus + veg sticks, fruit chaat, smoothies, popcorn, sandwich bites, energy balls. NEVER full meals like curry-rice, biryani, or thali.',
  dinner:    'DINNER: full evening meals — curries with rice or roti, dal + rice, biryani, stir-fries, grilled mains, hearty soups with bread, pasta with sauce, full thali-style spreads.',
};

// Stable system prompt — designed to be cacheable across requests.
// Anything dynamic (slot, fridge, members, exclude list) goes in the user message instead.
function buildStableSystemPrompt() {
  return `You are a home chef AI. Generate REAL, NAMED, PRACTICAL dishes that people actually cook and eat.

STRICT RULES:
- Every dish must be a real, recognised recipe — no invented combinations.
- The dish MUST match the requested meal type as defined in the meal-slot guide below.
- INGREDIENT GROUNDING (HARD RULE — enforced ruthlessly):
  * Every recipe's PRIMARY ingredient MUST literally appear in the fridge list provided. Do NOT suggest:
    - Tofu recipes if the fridge has no tofu
    - Chicken / fish / paneer / mango recipes when those aren't in the fridge
    - Beans / lentils / dal recipes if the fridge has none
    - Rice-based dishes if no rice / pasta if no pasta / noodles if no noodles
  * Pantry staples you MAY assume are available even if not listed: salt, oil, basic spices (cumin, turmeric, chilli, pepper), water, sugar.
  * Onion, tomato, garlic, ginger are common but NOT staples — only use them if listed.
  * If the fridge is sparse and no real recipe fits, return FEWER than the requested count (or even an empty array) rather than fabricate recipes the user can't make.
- EXPIRY PRIORITY (also strict): the fridge list shows each item as "Name (qty unit, expires in Nd)". You MUST:
  * Lead with recipes built around the items that expire SOONEST. If methi expires in 3d and lauki in 7d, the FIRST recipe must use methi (Methi Paneer, Aloo Methi, Methi Thepla, etc.) — not lauki.
  * Sort the returned array so position 0 is the most-urgent dish (uses an item expiring within 3 days), position 1 next-most-urgent, and so on.
  * If multiple items are expiring on the same day, prefer the one most central to the recipe (the "hero" ingredient).
  * Items expiring TODAY or tomorrow trump everything else — even cuisine match.
- DIETARY RULES (non-negotiable, enforce strictly):
  * If "Vegetarian" is in dietary preferences → NO chicken, fish, seafood, meat. Eggs are allowed only if no eggs allergy.
  * If "Vegan" is in dietary preferences → NO animal products at all (no dairy, no eggs, no honey, no fish, no meat).
  * If "Halal" → no pork, no alcohol-cooked dishes.
  * If "Kosher" → no pork, no shellfish.
  * If allergies are listed, NEVER include any of those allergens, even as a garnish.
- CUISINE: If the user has cuisine preferences, every dish MUST clearly belong to one of those cuisines (or be cuisine-neutral). Do not default to Indian style if the user has not chosen Indian. An American user without Indian preferences should NOT receive masala/tadka/curry-style dishes.
- The recipes you return must be clearly DIFFERENT from each other — different technique, different anchor ingredient where possible, different cooking style. Never return two near-identical dishes.
- NEVER use milk, juice, water, cream, yogurt, butter, or any liquid/condiment as the PRIMARY ingredient of a curry, stir-fry, or main dish. These are supporting ingredients only.
- If only dairy/drinks are available, suggest dishes where they play a supporting role (e.g. porridge, milkshake, smoothie, lassi, raita, custard).
- Prioritise items expiring soonest.
- Respect dislikes: do not make those foods the star of the dish.
- Age rules (strictly enforced):
  * Age 0–1 (infant): no salt, no sugar, no honey, no whole pieces, no strong spices — purees/mashes only.
  * Age 1–3 (toddler): no whole nuts, no raw honey, very mild spice, soft textures, small pieces.
  * Age 4–12 (child): mild spice OK, avoid extreme heat, no whole nuts.
  * Teen/adult: no restrictions beyond stated allergies and diet.
- The "safeFor" field must list ONLY members for whom the dish is genuinely safe given their age, allergies and diet.

MEAL-SLOT GUIDE (apply the one named in the user request):
- BREAKFAST: ${SLOT_GUIDE.breakfast}
- LUNCH: ${SLOT_GUIDE.lunch}
- SNACK: ${SLOT_GUIDE.snack}
- DINNER: ${SLOT_GUIDE.dinner}

OUTPUT FORMAT:
Return ONLY a valid JSON array, no markdown fencing, no prose, no explanation.
Each item:
{
  "name": "recipe name",
  "emoji": "single emoji",
  "description": "one sentence about the dish",
  "cookTime": <minutes as number>,
  "kcal": <approx calories per serving as number>,
  "protein": <grams protein as number>,
  "mealType": "<slot>",
  "usesExpiring": <true if uses item expiring within 3 days>,
  "safeFor": <array of member names this is safe for>,
  "ingredients": ["ingredient qty unit", ...],
  "steps": ["Step instruction.", "Step instruction.", ...],
  "tags": ["tag1", "tag2"]
}`;
}

function buildUserPrompt(args: {
  slot: string;
  itemList: string;
  cuisineStr: string;
  memberStr: string;
  excludeStr: string;
  planningDay?: string;
  dayOffset?: number;
  count?: number;
}) {
  const { slot, itemList, cuisineStr, memberStr, excludeStr, planningDay, dayOffset, count } = args;
  return `Fridge contents: ${itemList || '(empty)'}
Preferred cuisines: ${cuisineStr}
Household members: ${memberStr}
Meal type: ${slot}
Do not repeat these recently cooked meals: ${excludeStr}
Planning slot: ${planningDay || 'Today'}${typeof dayOffset === 'number' ? ` (day offset ${dayOffset})` : ''}

Generate ${count || 4} recipes for ${slot.toUpperCase()}. Each must be genuinely edible, distinct from the others, and unmistakably a ${slot} dish. If planning for later days, prefer items that can wait a little longer and avoid wasting the same anchor ingredient across every day.

Return ONLY the JSON array described in the system prompt — no markdown, no commentary.`;
}

function parseMealsJson(raw: string) {
  const trimmed = raw.trim().replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
  // Sometimes models return an object wrapper or pad with text; extract the first array.
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    return [];
  }
  try {
    return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
  } catch {
    return [];
  }
}

async function generateWithAnthropic(args: {
  systemPrompt: string;
  userPrompt: string;
}) {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    // Cache the long, stable system prompt — it repeats verbatim on every request.
    system: [{ type: 'text', text: args.systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: args.userPrompt }],
  });
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return textBlock?.text ?? '';
}

async function generateWithOpenAI(args: {
  systemPrompt: string;
  userPrompt: string;
}) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `OpenAI request failed (${res.status})`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export async function POST(req: NextRequest) {
  try {
    const { items, cuisines, members, mealType, excludeMeals, count, planningDay, dayOffset } = await req.json();

    if (!ANTHROPIC_KEY && !OPENAI_KEY) {
      return NextResponse.json({ meals: [], error: 'Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is configured on the server.' });
    }
    // Debug: surface which keys were found (names only, never values), so the client can see
    // why a particular provider was picked. Helpful when the var got named non-canonically.
    const detected: Record<string, boolean> = {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      Claude_API_Key:    !!process.env.Claude_API_Key,
      CLAUDE_API_KEY:    !!process.env.CLAUDE_API_KEY,
      OPENAI_API_KEY:    !!process.env.OPENAI_API_KEY,
    };

    const slot = String(mealType || 'dinner').toLowerCase();
    const itemList = describeItems(items);
    const cuisineStr = cuisines?.length ? cuisines.join(', ') : 'any';
    const memberStr = describeMembers(members);
    const excludeStr = Array.isArray(excludeMeals) && excludeMeals.length ? excludeMeals.join(', ') : 'none';

    const systemPrompt = buildStableSystemPrompt();
    const userPrompt = buildUserPrompt({ slot, itemList, cuisineStr, memberStr, excludeStr, planningDay, dayOffset, count });

    let raw = '';
    let provider = '';
    let anthropicError = '';
    let openaiError = '';

    if (ANTHROPIC_KEY) {
      try {
        raw = await generateWithAnthropic({ systemPrompt, userPrompt });
        provider = 'claude-sonnet-4-6';
      } catch (e) {
        anthropicError = e instanceof Error ? e.message : 'Anthropic call failed';
      }
    }

    if (!raw && OPENAI_KEY) {
      try {
        raw = await generateWithOpenAI({ systemPrompt, userPrompt });
        provider = 'gpt-4o';
      } catch (e) {
        openaiError = e instanceof Error ? e.message : 'OpenAI call failed';
      }
    }

    if (!raw) {
      return NextResponse.json({
        meals: [],
        error: anthropicError || openaiError || 'No model produced a response.',
        anthropicError,
        openaiError,
        detected,
      });
    }

    const meals = parseMealsJson(raw);
    return NextResponse.json({ meals, provider, detected });
  } catch (error) {
    return NextResponse.json({ meals: [], error: error instanceof Error ? error.message : 'Meal generation failed' });
  }
}
