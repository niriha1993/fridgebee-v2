// lib/edamam.ts
// Edamam Recipe Search API integration. Free tier = 10k requests/month.
// 2.3M recipes with rich filtering: diet, health (kosher, alcohol-free,
// pork-free, vegan, etc.), cuisine, meal type, dish type.
//
// We use Edamam as a SECOND-PASS source after TheMealDB. MealDB is fast and
// keyless; Edamam adds variety + dietary precision that MealDB lacks.
// Both sources go into the same candidate pool that the LLM ranks.

const APP_ID  = process.env.EDAMAM_APP_ID  || '';
const APP_KEY = process.env.EDAMAM_APP_KEY || '';
const API_BASE = 'https://api.edamam.com/api/recipes/v2';

// FridgeBee cuisine ids → Edamam `cuisineType` values. Edamam supports several
// per call, so we union them.
const CUISINE_TO_EDAMAM: Record<string, string[]> = {
  Indian:        ['Indian'],
  Asian:         ['Asian','Chinese','Japanese','South East Asian'],
  Western:       ['American','British','French','Central Europe','Eastern Europe'],
  Mediterranean: ['Mediterranean','Italian','Middle Eastern'],
  Mexican:       ['Mexican','Caribbean','South American'],
};

// FridgeBee meal-time slot → Edamam `mealType` values.
const SLOT_TO_EDAMAM: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
  snack:     'Snack',
};

// FridgeBee dietary filters → Edamam `health` labels. Edamam's vegan/vegetarian
// labels are STRICT (every ingredient must qualify) so we trust them fully.
const DIET_TO_HEALTH: Record<string, string[]> = {
  Vegetarian: ['vegetarian'],
  Vegan:      ['vegan'],
  Halal:      ['pork-free','alcohol-free'],   // Edamam doesn't have a direct halal flag — combine
  Kosher:     ['kosher'],
  'Gluten-free': ['gluten-free'],
  'Dairy-free': ['dairy-free'],
  Pescatarian: ['pescatarian'],
};

interface EdamamHit {
  recipe: {
    label: string;
    image?: string;
    source?: string;
    url?: string;
    cuisineType?: string[];
    mealType?: string[];
    dishType?: string[];
    healthLabels?: string[];
    ingredientLines?: string[];
    ingredients?: { food: string }[];
    totalTime?: number;
    yield?: number;
    calories?: number;
  };
}

interface EdamamResponse {
  hits?: EdamamHit[];
  count?: number;
}

async function fetchJson<T>(url: string, timeoutMs = 4500): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Edamam-Account-User': 'fridgebee' }, // recommended by Edamam docs
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch real recipe NAMES from Edamam matching the user's fridge ingredients,
 * cuisine, meal-time slot, and dietary filters. Returns up to ~15 names.
 *
 * The API is generous with results so we cap to keep the AI prompt focused.
 * Returns [] if Edamam isn't configured or the call fails — never blocks.
 */
export async function fetchEdamamCandidates(args: {
  ingredients: string[];           // user's fridge item names
  cuisines: string[];              // FridgeBee cuisine ids
  slot: string;                    // breakfast/lunch/dinner
  dietaryFilters: string[];        // FridgeBee diet ids
}): Promise<string[]> {
  if (!APP_ID || !APP_KEY) return [];

  const { ingredients, cuisines, slot, dietaryFilters } = args;

  // Build query string. Edamam wants `q` to be a search term. We use the top
  // 3 fridge ingredients joined as a query — gives recipes that mention them.
  const q = ingredients.slice(0, 3).join(' ').trim() || 'home cooking';
  const params = new URLSearchParams();
  params.append('type', 'public');
  params.append('app_id', APP_ID);
  params.append('app_key', APP_KEY);
  params.append('q', q);
  params.append('field', 'label');
  params.append('field', 'cuisineType');
  params.append('random', 'true');

  // Cuisine union (Edamam allows multiple)
  const cuisineLabels = Array.from(new Set(cuisines.flatMap(c => CUISINE_TO_EDAMAM[c] || [])));
  for (const c of cuisineLabels.slice(0, 6)) params.append('cuisineType', c);

  // Meal type
  const mealType = SLOT_TO_EDAMAM[slot];
  if (mealType) params.append('mealType', mealType);

  // Dietary filters via `health` labels
  const healthLabels = Array.from(new Set(dietaryFilters.flatMap(d => DIET_TO_HEALTH[d] || [])));
  for (const h of healthLabels) params.append('health', h);

  const url = `${API_BASE}?${params.toString()}`;
  const data = await fetchJson<EdamamResponse>(url);
  if (!data?.hits?.length) return [];

  return data.hits
    .map(h => h.recipe.label)
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .slice(0, 15);
}
