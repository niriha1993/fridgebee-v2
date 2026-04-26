// lib/themealdb.ts
// Free TheMealDB API integration. No key, no rate-limit issues for our scale.
// We fetch real recipes by ingredient and area (cuisine) to supplement our
// curated dish list — so when a user has Cabbage + Capsicum, we can suggest
// real human-written recipes instead of relying purely on AI generation.

const API_BASE = 'https://www.themealdb.com/api/json/v1/1';

// FridgeBee cuisine id → MealDB Area name. Some MealDB areas don't exist
// (Latin), so we fall back to the closest match.
const CUISINE_TO_AREA: Record<string, string[]> = {
  Indian:        ['Indian'],
  Asian:         ['Chinese','Thai','Japanese','Vietnamese','Malaysian','Filipino'],
  Western:       ['American','British','French'],
  Mediterranean: ['Italian','Greek','Mediterranean','Spanish','Turkish'],
  Mexican:       ['Mexican'],
};

// Fridge item names → MealDB ingredient names. MealDB uses Western-leaning
// names (Bell Pepper, Eggplant) so we map our preferred labels.
const INGREDIENT_ALIAS: Record<string, string> = {
  capsicum: 'Bell Pepper',
  'shimla mirch': 'Bell Pepper',
  brinjal: 'Eggplant',
  baingan: 'Eggplant',
  aubergine: 'Eggplant',
  bhindi: 'Okra',
  'lady finger': 'Okra',
  ladyfinger: 'Okra',
  methi: 'Fenugreek',
  fenugreek: 'Fenugreek',
  palak: 'Spinach',
  dhaniya: 'Coriander',
  dhania: 'Coriander',
  cilantro: 'Coriander',
  pyaaz: 'Onion',
  aloo: 'Potato',
  tamatar: 'Tomato',
  gajar: 'Carrot',
  adrak: 'Ginger',
  lehsun: 'Garlic',
  nimbu: 'Lemon',
  paneer: 'Paneer',
  doodh: 'Milk',
  paal: 'Milk',
  susu: 'Milk',
  curd: 'Yogurt',
  dahi: 'Yogurt',
  chawal: 'Rice',
  basmati: 'Rice',
  atta: 'Flour',
  besan: 'Gram Flour',
  toor: 'Lentils',
  'toor dal': 'Lentils',
  dal: 'Lentils',
  rajma: 'Kidney Beans',
  chana: 'Chickpeas',
  chole: 'Chickpeas',
  lauki: 'Bottle Gourd', // not in MealDB — query will return 0, fine
  karela: 'Bitter Gourd',
};

function aliasIngredient(name: string): string {
  const lc = name.toLowerCase().trim();
  if (INGREDIENT_ALIAS[lc]) return INGREDIENT_ALIAS[lc];
  // First word match (e.g. "Alphonso Mango" → "Mango")
  const first = lc.split(/\s+/)[0];
  if (INGREDIENT_ALIAS[first]) return INGREDIENT_ALIAS[first];
  // Default: capitalise first letter (TheMealDB is case-sensitive on filter)
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

interface MealDBLite {
  idMeal: string;
  strMeal: string;
  strMealThumb?: string;
}

async function fetchJson<T>(url: string, timeoutMs = 4000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch real recipe NAMES from TheMealDB based on the user's fridge + cuisine
 * preferences. Returns up to ~30 distinct recipe names that we feed to the AI
 * as a SECOND candidate list (the first being our curated CUISINE_DISHES).
 *
 * Strategy:
 *   1. For each cuisine the user picked, fetch recipes by area.
 *   2. For each fridge ingredient, fetch recipes by main ingredient.
 *   3. If both filters used, intersect (recipes must be in both sets).
 *   4. Otherwise, take the union.
 *
 * Always returns gracefully — if MealDB is down or slow, returns []. Never
 * blocks the meal generation flow.
 */
export async function fetchMealDBCandidates(args: {
  ingredients: string[];
  cuisines: string[]; // FridgeBee cuisine ids ("Indian", "Asian", "Western", ...)
}): Promise<string[]> {
  const { ingredients, cuisines } = args;

  // 1. Cuisine → area lookups
  const areas: string[] = cuisines.flatMap(c => CUISINE_TO_AREA[c] || []);
  const areaResults = await Promise.all(
    areas.map(a => fetchJson<{ meals: MealDBLite[] | null }>(`${API_BASE}/filter.php?a=${encodeURIComponent(a)}`)),
  );
  const cuisineRecipes = new Set<string>();
  for (const r of areaResults) {
    for (const m of r?.meals || []) cuisineRecipes.add(m.strMeal);
  }

  // 2. Ingredient lookups (cap at 5 ingredients to keep concurrent fetches bounded)
  const ingredientNames = ingredients
    .slice(0, 5)
    .map(aliasIngredient);
  const ingResults = await Promise.all(
    ingredientNames.map(i => fetchJson<{ meals: MealDBLite[] | null }>(`${API_BASE}/filter.php?i=${encodeURIComponent(i)}`)),
  );
  const ingredientRecipes = new Set<string>();
  for (const r of ingResults) {
    for (const m of r?.meals || []) ingredientRecipes.add(m.strMeal);
  }

  // 3. Combine: prefer intersection (cuisine ∩ ingredient), fall back to union.
  let combined: string[];
  if (cuisineRecipes.size && ingredientRecipes.size) {
    combined = Array.from(ingredientRecipes).filter(r => cuisineRecipes.has(r));
    // If intersection is too small, augment with cuisine-only matches.
    if (combined.length < 8) {
      const extra = Array.from(cuisineRecipes).filter(r => !combined.includes(r));
      combined = combined.concat(extra.slice(0, 12 - combined.length));
    }
  } else {
    combined = Array.from(cuisineRecipes.size ? cuisineRecipes : ingredientRecipes);
  }

  return combined.slice(0, 20);
}
