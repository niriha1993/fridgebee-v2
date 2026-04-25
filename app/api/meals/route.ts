import { NextRequest, NextResponse } from 'next/server';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const { items, cuisines, members, mealType, excludeMeals, count, planningDay, dayOffset } = await req.json();
    if (!OPENAI_KEY) return NextResponse.json({ meals: [], error: 'OPENAI_API_KEY is not configured on the server.' });

    const itemList = (items || [])
      .map((i: { name: string; qty: number; unit: string; expiry?: string }) => {
        const daysLeft = i.expiry
          ? Math.ceil((new Date(i.expiry).getTime() - Date.now()) / 86400000)
          : 99;
        return `${i.name} (${i.qty}${i.unit}, expires in ${daysLeft}d)`;
      })
      .join(', ');

    const cuisineStr = cuisines?.length ? cuisines.join(', ') : 'any';
    const memberStr = members?.length
      ? members.map((m: { name: string; isKid?: boolean; age?: number; dietaryFilters?: string[]; allergies?: string[]; dislikes?: string[] }) => {
          let desc = m.name;
          if (m.age != null) desc += ` (age ${m.age})`;
          else if (m.isKid) desc += ' (child)';
          if (m.dietaryFilters?.length) desc += ': ' + m.dietaryFilters.join(', ');
          if (m.allergies?.length) desc += ', allergic to: ' + m.allergies.join(', ');
          if (m.dislikes?.length) desc += ', dislikes: ' + m.dislikes.join(', ');
          return desc;
        }).join('; ')
      : 'none';
    const excludeStr = Array.isArray(excludeMeals) && excludeMeals.length ? excludeMeals.join(', ') : 'none';

    const slot = String(mealType || 'dinner').toLowerCase();
    const slotGuide: Record<string, string> = {
      breakfast: 'BREAKFAST: morning dishes ONLY — oats/porridge, eggs (omelette/scrambled/poached/bhurji), pancakes, paratha, idli, dosa, upma, poha, smoothie bowls, toast, yogurt parfaits, fruit bowls, breakfast wraps. NEVER suggest curries, biryani, dal-rice, full mains, or heavy stir-fries here.',
      lunch:     'LUNCH: midday meals — rice bowls, roti + sabzi, sandwiches, wraps, salads with protein, pasta, light curries with rice, khichdi, fried rice, noodle bowls, grain bowls. Filling but not as heavy as dinner.',
      snack:     'SNACK: small bites only (target under 250 kcal) — chai + biscuits, masala peanuts, fruit + yogurt, samosa, pakora, hummus + veg sticks, fruit chaat, smoothies, popcorn, sandwich bites, energy balls. NEVER full meals like curry-rice, biryani, or thali.',
      dinner:    'DINNER: full evening meals — curries with rice or roti, dal + rice, biryani, stir-fries, grilled mains, hearty soups with bread, pasta with sauce, full thali-style spreads.',
    };
    const slotInstruction = slotGuide[slot] || slotGuide.dinner;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a home chef AI. Generate REAL, NAMED, PRACTICAL dishes that people actually cook and eat.

STRICT RULES:
- Every dish must be a real, recognised recipe — no invented combinations.
- The dish MUST match the requested meal type. ${slotInstruction}
- The recipes you return must be clearly DIFFERENT from each other — different technique, different anchor ingredient where possible, different cooking style. Never return two near-identical dishes.
- NEVER use milk, juice, water, cream, yogurt, butter, or any liquid/condiment as the PRIMARY ingredient of a curry, stir-fry, or main dish. These are supporting ingredients only.
- If only dairy/drinks are available, suggest dishes where they play a supporting role (e.g. porridge, milkshake, smoothie, lassi, raita, custard).
- Prioritise items expiring soonest.
- Respect ALL allergies and dietary restrictions exactly — never include an allergen even as a garnish.
- Respect dislikes: do not make those foods the star of the dish.
- Preferred cuisines must visibly shape the dish style and name.
- Age rules (strictly enforced):
  * Age 0–1 (infant): no salt, no sugar, no honey, no whole pieces, no strong spices — purees/mashes only.
  * Age 1–3 (toddler): no whole nuts, no raw honey, very mild spice, soft textures, small pieces.
  * Age 4–12 (child): mild spice OK, avoid extreme heat, no whole nuts.
  * Teen/adult: no restrictions beyond stated allergies and diet.
- The "safeFor" field must list ONLY members for whom the dish is genuinely safe given their age, allergies and diet.
- Return ONLY valid JSON array, no markdown or explanation.`,
          },
          {
            role: 'user',
            content: `Fridge contents: ${itemList}
Preferred cuisines: ${cuisineStr}
Household members: ${memberStr}
Meal type: ${slot}
Do not repeat these recently cooked meals: ${excludeStr}
Planning slot: ${planningDay || 'Today'}${typeof dayOffset === 'number' ? ` (day offset ${dayOffset})` : ''}

Generate ${count || 4} recipes for ${slot.toUpperCase()}. Each must be genuinely edible, distinct from the others, and unmistakably a ${slot} dish.
If planning for later days, prefer items that can wait a little longer and avoid wasting the same anchor ingredient across every day.

Return JSON array:
[{
  "name": "recipe name",
  "emoji": "single emoji",
  "description": "one sentence about the dish",
  "cookTime": <minutes as number>,
  "kcal": <approx calories per serving as number>,
  "protein": <grams protein as number>,
  "mealType": "${slot}",
  "usesExpiring": <true if uses item expiring within 3 days>,
  "safeFor": <array of member names this is safe for, considering allergies/diet>,
  "ingredients": ["ingredient qty unit", ...],
  "steps": ["Step instruction.", "Step instruction.", ...],
  "tags": ["tag1", "tag2"]
}]`,
          },
        ],
        temperature: 0.85,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json({ meals: [], error: errText || `OpenAI request failed (${res.status})` });
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '[]';
    const meals = JSON.parse(raw.replace(/^```json\n?/, '').replace(/\n?```$/, ''));
    return NextResponse.json({ meals });
  } catch (error) {
    return NextResponse.json({ meals: [], error: error instanceof Error ? error.message : 'Meal generation failed' });
  }
}
