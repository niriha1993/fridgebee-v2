import { NextRequest, NextResponse } from 'next/server';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

const KNOWN_ITEMS: Array<{ alias: string; canonical: string; qty: number; unit: string; category: string; emoji: string }> = [
  // Produce — English + Hindi/Tamil/Malay aliases
  { alias: 'bhindi', canonical: 'Bhindi', qty: 500, unit: 'g', category: 'Produce', emoji: '🥒' },
  { alias: 'okra', canonical: 'Okra', qty: 500, unit: 'g', category: 'Produce', emoji: '🥒' },
  { alias: 'ladyfinger', canonical: 'Okra', qty: 500, unit: 'g', category: 'Produce', emoji: '🥒' },
  { alias: 'pumpkin', canonical: 'Pumpkin', qty: 1, unit: 'kg', category: 'Produce', emoji: '🎃' },
  { alias: 'kaddu', canonical: 'Pumpkin', qty: 1, unit: 'kg', category: 'Produce', emoji: '🎃' },
  { alias: 'gobhi', canonical: 'Cauliflower', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥦' },
  { alias: 'gobi', canonical: 'Cauliflower', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥦' },
  { alias: 'phool gobi', canonical: 'Cauliflower', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥦' },
  { alias: 'cauliflower', canonical: 'Cauliflower', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥦' },
  { alias: 'broccoli', canonical: 'Broccoli', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥦' },
  { alias: 'cabbage', canonical: 'Cabbage', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥬' },
  { alias: 'patta gobi', canonical: 'Cabbage', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥬' },
  { alias: 'onion', canonical: 'Onion', qty: 500, unit: 'g', category: 'Produce', emoji: '🧅' },
  { alias: 'onions', canonical: 'Onion', qty: 500, unit: 'g', category: 'Produce', emoji: '🧅' },
  { alias: 'pyaaz', canonical: 'Onion', qty: 500, unit: 'g', category: 'Produce', emoji: '🧅' },
  { alias: 'pyaz', canonical: 'Onion', qty: 500, unit: 'g', category: 'Produce', emoji: '🧅' },
  { alias: 'tomato', canonical: 'Tomato', qty: 4, unit: 'pcs', category: 'Produce', emoji: '🍅' },
  { alias: 'tomatoes', canonical: 'Tomato', qty: 4, unit: 'pcs', category: 'Produce', emoji: '🍅' },
  { alias: 'tamatar', canonical: 'Tomato', qty: 4, unit: 'pcs', category: 'Produce', emoji: '🍅' },
  { alias: 'potato', canonical: 'Potato', qty: 1, unit: 'kg', category: 'Produce', emoji: '🥔' },
  { alias: 'potatoes', canonical: 'Potato', qty: 1, unit: 'kg', category: 'Produce', emoji: '🥔' },
  { alias: 'aloo', canonical: 'Potato', qty: 1, unit: 'kg', category: 'Produce', emoji: '🥔' },
  { alias: 'carrot', canonical: 'Carrot', qty: 500, unit: 'g', category: 'Produce', emoji: '🥕' },
  { alias: 'carrots', canonical: 'Carrot', qty: 500, unit: 'g', category: 'Produce', emoji: '🥕' },
  { alias: 'gajar', canonical: 'Carrot', qty: 500, unit: 'g', category: 'Produce', emoji: '🥕' },
  { alias: 'cucumber', canonical: 'Cucumber', qty: 2, unit: 'pcs', category: 'Produce', emoji: '🥒' },
  { alias: 'kheera', canonical: 'Cucumber', qty: 2, unit: 'pcs', category: 'Produce', emoji: '🥒' },
  { alias: 'capsicum', canonical: 'Bell pepper', qty: 2, unit: 'pcs', category: 'Produce', emoji: '🫑' },
  { alias: 'bell pepper', canonical: 'Bell pepper', qty: 2, unit: 'pcs', category: 'Produce', emoji: '🫑' },
  { alias: 'shimla mirch', canonical: 'Bell pepper', qty: 2, unit: 'pcs', category: 'Produce', emoji: '🫑' },
  { alias: 'spinach', canonical: 'Spinach', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🥬' },
  { alias: 'palak', canonical: 'Spinach', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🥬' },
  { alias: 'lettuce', canonical: 'Lettuce', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥬' },
  { alias: 'coriander', canonical: 'Coriander', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'cilantro', canonical: 'Coriander', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'dhania', canonical: 'Coriander', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'mint', canonical: 'Mint', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'pudina', canonical: 'Mint', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'garlic', canonical: 'Garlic', qty: 100, unit: 'g', category: 'Produce', emoji: '🧄' },
  { alias: 'lehsun', canonical: 'Garlic', qty: 100, unit: 'g', category: 'Produce', emoji: '🧄' },
  { alias: 'lasun', canonical: 'Garlic', qty: 100, unit: 'g', category: 'Produce', emoji: '🧄' },
  { alias: 'ginger', canonical: 'Ginger', qty: 100, unit: 'g', category: 'Produce', emoji: '🫚' },
  { alias: 'adrak', canonical: 'Ginger', qty: 100, unit: 'g', category: 'Produce', emoji: '🫚' },
  { alias: 'lemon', canonical: 'Lemon', qty: 3, unit: 'pcs', category: 'Produce', emoji: '🍋' },
  { alias: 'lime', canonical: 'Lemon', qty: 3, unit: 'pcs', category: 'Produce', emoji: '🍋' },
  { alias: 'nimbu', canonical: 'Lemon', qty: 3, unit: 'pcs', category: 'Produce', emoji: '🍋' },
  { alias: 'apple', canonical: 'Apple', qty: 4, unit: 'pcs', category: 'Produce', emoji: '🍎' },
  { alias: 'banana', canonical: 'Banana', qty: 6, unit: 'pcs', category: 'Produce', emoji: '🍌' },
  { alias: 'kela', canonical: 'Banana', qty: 6, unit: 'pcs', category: 'Produce', emoji: '🍌' },
  { alias: 'mango', canonical: 'Mango', qty: 2, unit: 'pcs', category: 'Produce', emoji: '🥭' },
  { alias: 'aam', canonical: 'Mango', qty: 2, unit: 'pcs', category: 'Produce', emoji: '🥭' },
  { alias: 'orange', canonical: 'Orange', qty: 4, unit: 'pcs', category: 'Produce', emoji: '🍊' },
  { alias: 'avocado', canonical: 'Avocado', qty: 2, unit: 'pcs', category: 'Produce', emoji: '🥑' },
  { alias: 'grapes', canonical: 'Grapes', qty: 250, unit: 'g', category: 'Produce', emoji: '🍇' },
  { alias: 'berries', canonical: 'Berries', qty: 200, unit: 'g', category: 'Produce', emoji: '🫐' },
  { alias: 'strawberry', canonical: 'Strawberries', qty: 200, unit: 'g', category: 'Produce', emoji: '🍓' },
  { alias: 'strawberries', canonical: 'Strawberries', qty: 200, unit: 'g', category: 'Produce', emoji: '🍓' },
  { alias: 'peas', canonical: 'Peas', qty: 250, unit: 'g', category: 'Produce', emoji: '🫛' },
  { alias: 'matar', canonical: 'Peas', qty: 250, unit: 'g', category: 'Produce', emoji: '🫛' },
  { alias: 'beans', canonical: 'Beans', qty: 250, unit: 'g', category: 'Produce', emoji: '🫛' },
  { alias: 'corn', canonical: 'Corn', qty: 2, unit: 'pcs', category: 'Produce', emoji: '🌽' },
  { alias: 'mushroom', canonical: 'Mushrooms', qty: 200, unit: 'g', category: 'Produce', emoji: '🍄' },
  { alias: 'mushrooms', canonical: 'Mushrooms', qty: 200, unit: 'g', category: 'Produce', emoji: '🍄' },
  // Indian / South Asian veg
  { alias: 'methi', canonical: 'Methi', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'fenugreek', canonical: 'Methi', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'lauki', canonical: 'Lauki', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥒' },
  { alias: 'dudhi', canonical: 'Lauki', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥒' },
  { alias: 'bottle gourd', canonical: 'Lauki', qty: 1, unit: 'pcs', category: 'Produce', emoji: '🥒' },
  { alias: 'karela', canonical: 'Karela', qty: 250, unit: 'g', category: 'Produce', emoji: '🥒' },
  { alias: 'bitter gourd', canonical: 'Karela', qty: 250, unit: 'g', category: 'Produce', emoji: '🥒' },
  { alias: 'tinda', canonical: 'Tinda', qty: 500, unit: 'g', category: 'Produce', emoji: '🥒' },
  { alias: 'tindora', canonical: 'Tindora', qty: 250, unit: 'g', category: 'Produce', emoji: '🥒' },
  { alias: 'parwal', canonical: 'Parwal', qty: 250, unit: 'g', category: 'Produce', emoji: '🥒' },
  { alias: 'baingan', canonical: 'Baingan', qty: 500, unit: 'g', category: 'Produce', emoji: '🍆' },
  { alias: 'brinjal', canonical: 'Brinjal', qty: 500, unit: 'g', category: 'Produce', emoji: '🍆' },
  { alias: 'eggplant', canonical: 'Eggplant', qty: 500, unit: 'g', category: 'Produce', emoji: '🍆' },
  { alias: 'arbi', canonical: 'Arbi', qty: 500, unit: 'g', category: 'Produce', emoji: '🥔' },
  { alias: 'taro', canonical: 'Taro', qty: 500, unit: 'g', category: 'Produce', emoji: '🥔' },
  { alias: 'shakarkandi', canonical: 'Sweet potato', qty: 500, unit: 'g', category: 'Produce', emoji: '🍠' },
  { alias: 'sweet potato', canonical: 'Sweet potato', qty: 500, unit: 'g', category: 'Produce', emoji: '🍠' },
  { alias: 'drumstick', canonical: 'Drumstick', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'moringa', canonical: 'Drumstick', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'sahjan', canonical: 'Drumstick', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'tinda', canonical: 'Tinda', qty: 500, unit: 'g', category: 'Produce', emoji: '🥒' },
  { alias: 'kachri', canonical: 'Kachri', qty: 250, unit: 'g', category: 'Produce', emoji: '🥒' },
  { alias: 'amaranth', canonical: 'Amaranth', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🥬' },
  { alias: 'cholai', canonical: 'Amaranth', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🥬' },
  { alias: 'sarson', canonical: 'Mustard greens', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🥬' },
  { alias: 'bathua', canonical: 'Bathua', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🥬' },
  { alias: 'kaddu', canonical: 'Pumpkin', qty: 1, unit: 'kg', category: 'Produce', emoji: '🎃' },
  { alias: 'turai', canonical: 'Turai', qty: 500, unit: 'g', category: 'Produce', emoji: '🥒' },
  { alias: 'ridge gourd', canonical: 'Turai', qty: 500, unit: 'g', category: 'Produce', emoji: '🥒' },
  // Dairy
  { alias: 'milk', canonical: 'Milk', qty: 1, unit: 'L', category: 'Dairy', emoji: '🥛' },
  { alias: 'doodh', canonical: 'Milk', qty: 1, unit: 'L', category: 'Dairy', emoji: '🥛' },
  { alias: 'susu', canonical: 'Milk', qty: 1, unit: 'L', category: 'Dairy', emoji: '🥛' },
  { alias: 'paneer', canonical: 'Paneer', qty: 200, unit: 'g', category: 'Dairy', emoji: '🧀' },
  { alias: 'cheese', canonical: 'Cheese', qty: 200, unit: 'g', category: 'Dairy', emoji: '🧀' },
  { alias: 'mozzarella', canonical: 'Mozzarella', qty: 200, unit: 'g', category: 'Dairy', emoji: '🧀' },
  { alias: 'feta', canonical: 'Feta', qty: 150, unit: 'g', category: 'Dairy', emoji: '🧀' },
  { alias: 'butter', canonical: 'Butter', qty: 100, unit: 'g', category: 'Dairy', emoji: '🧈' },
  { alias: 'makhan', canonical: 'Butter', qty: 100, unit: 'g', category: 'Dairy', emoji: '🧈' },
  { alias: 'yogurt', canonical: 'Yogurt', qty: 400, unit: 'g', category: 'Dairy', emoji: '🥣' },
  { alias: 'curd', canonical: 'Yogurt', qty: 400, unit: 'g', category: 'Dairy', emoji: '🥣' },
  { alias: 'dahi', canonical: 'Yogurt', qty: 400, unit: 'g', category: 'Dairy', emoji: '🥣' },
  { alias: 'eggs', canonical: 'Eggs', qty: 12, unit: 'pcs', category: 'Dairy', emoji: '🥚' },
  { alias: 'egg', canonical: 'Eggs', qty: 12, unit: 'pcs', category: 'Dairy', emoji: '🥚' },
  { alias: 'anda', canonical: 'Eggs', qty: 12, unit: 'pcs', category: 'Dairy', emoji: '🥚' },
  { alias: 'ande', canonical: 'Eggs', qty: 12, unit: 'pcs', category: 'Dairy', emoji: '🥚' },
  { alias: 'telur', canonical: 'Eggs', qty: 12, unit: 'pcs', category: 'Dairy', emoji: '🥚' },
  // Meat / seafood
  { alias: 'chicken', canonical: 'Chicken', qty: 500, unit: 'g', category: 'Meat', emoji: '🍗' },
  { alias: 'murgh', canonical: 'Chicken', qty: 500, unit: 'g', category: 'Meat', emoji: '🍗' },
  { alias: 'mutton', canonical: 'Mutton', qty: 500, unit: 'g', category: 'Meat', emoji: '🥩' },
  { alias: 'lamb', canonical: 'Lamb', qty: 500, unit: 'g', category: 'Meat', emoji: '🥩' },
  { alias: 'beef', canonical: 'Beef', qty: 500, unit: 'g', category: 'Meat', emoji: '🥩' },
  { alias: 'pork', canonical: 'Pork', qty: 500, unit: 'g', category: 'Meat', emoji: '🥓' },
  { alias: 'fish', canonical: 'Fish', qty: 300, unit: 'g', category: 'Seafood', emoji: '🐟' },
  { alias: 'machli', canonical: 'Fish', qty: 300, unit: 'g', category: 'Seafood', emoji: '🐟' },
  { alias: 'salmon', canonical: 'Salmon', qty: 300, unit: 'g', category: 'Seafood', emoji: '🐟' },
  { alias: 'prawns', canonical: 'Prawns', qty: 300, unit: 'g', category: 'Seafood', emoji: '🦐' },
  { alias: 'shrimp', canonical: 'Prawns', qty: 300, unit: 'g', category: 'Seafood', emoji: '🦐' },
  { alias: 'tofu', canonical: 'Tofu', qty: 300, unit: 'g', category: 'Meat', emoji: '🥡' },
  // Grains / pantry
  { alias: 'bread', canonical: 'Bread', qty: 1, unit: 'loaf', category: 'Grains', emoji: '🍞' },
  { alias: 'roti', canonical: 'Roti', qty: 6, unit: 'pcs', category: 'Grains', emoji: '🫓' },
  { alias: 'rice', canonical: 'Rice', qty: 1, unit: 'kg', category: 'Grains', emoji: '🍚' },
  { alias: 'chawal', canonical: 'Rice', qty: 1, unit: 'kg', category: 'Grains', emoji: '🍚' },
  { alias: 'pasta', canonical: 'Pasta', qty: 500, unit: 'g', category: 'Grains', emoji: '🍝' },
  { alias: 'noodles', canonical: 'Noodles', qty: 500, unit: 'g', category: 'Grains', emoji: '🍜' },
  { alias: 'oats', canonical: 'Oats', qty: 500, unit: 'g', category: 'Grains', emoji: '🥣' },
  { alias: 'dal', canonical: 'Dal', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'lentils', canonical: 'Lentils', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'rajma', canonical: 'Rajma', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'chickpeas', canonical: 'Chickpeas', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'chana', canonical: 'Chickpeas', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'chole', canonical: 'Chole', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'kabuli chana', canonical: 'Chole', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'urad', canonical: 'Urad dal', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'urad dal', canonical: 'Urad dal', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'moong', canonical: 'Moong dal', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'moong dal', canonical: 'Moong dal', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'masoor', canonical: 'Masoor dal', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'toor', canonical: 'Toor dal', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'toor dal', canonical: 'Toor dal', qty: 500, unit: 'g', category: 'Grains', emoji: '🫘' },
  { alias: 'atta', canonical: 'Atta', qty: 1, unit: 'kg', category: 'Grains', emoji: '🌾' },
  { alias: 'maida', canonical: 'Maida', qty: 1, unit: 'kg', category: 'Grains', emoji: '🌾' },
  { alias: 'besan', canonical: 'Besan', qty: 500, unit: 'g', category: 'Grains', emoji: '🌾' },
  { alias: 'sooji', canonical: 'Sooji', qty: 500, unit: 'g', category: 'Grains', emoji: '🌾' },
  { alias: 'rava', canonical: 'Sooji', qty: 500, unit: 'g', category: 'Grains', emoji: '🌾' },
  { alias: 'poha', canonical: 'Poha', qty: 500, unit: 'g', category: 'Grains', emoji: '🌾' },
  { alias: 'idli rava', canonical: 'Idli rava', qty: 500, unit: 'g', category: 'Grains', emoji: '🌾' },
  { alias: 'jaggery', canonical: 'Jaggery', qty: 500, unit: 'g', category: 'Condiments', emoji: '🍯' },
  { alias: 'gur', canonical: 'Jaggery', qty: 500, unit: 'g', category: 'Condiments', emoji: '🍯' },
  { alias: 'green chilli', canonical: 'Green chilli', qty: 100, unit: 'g', category: 'Produce', emoji: '🌶️' },
  { alias: 'hari mirch', canonical: 'Green chilli', qty: 100, unit: 'g', category: 'Produce', emoji: '🌶️' },
  { alias: 'curry leaves', canonical: 'Curry leaves', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'kadi patta', canonical: 'Curry leaves', qty: 1, unit: 'bunch', category: 'Produce', emoji: '🌿' },
  { alias: 'tortilla', canonical: 'Tortilla', qty: 8, unit: 'pcs', category: 'Grains', emoji: '🫓' },
  { alias: 'pita', canonical: 'Pita', qty: 4, unit: 'pcs', category: 'Grains', emoji: '🫓' },
];

function mapCategory(category?: string) {
  switch ((category || '').toLowerCase()) {
    case 'protein': return 'Meat';
    case 'beverages': return 'Drinks';
    default:
      if (!category) return 'Other';
      return category.replace(/^./, c => c.toUpperCase());
  }
}

function guessShelf(category: string) {
  if (['Dairy', 'Meat', 'Seafood', 'Frozen', 'Drinks'].includes(category)) return 'fridge';
  if (['Grains', 'Snacks', 'Condiments', 'Other'].includes(category)) return 'pantry';
  return 'fridge';
}

function expiryDaysFor(category: string) {
  if (category === 'Meat') return 3;
  if (category === 'Seafood') return 2;
  if (category === 'Grains' || category === 'Condiments') return 180;
  if (category === 'Frozen') return 90;
  return 7;
}

function expiryFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeItem(it: { item_name?: string; quantity?: number; unit?: string; category?: string; emoji?: string; }) {
  const category = mapCategory(it.category);
  return {
    name: (it.item_name || '').trim(),
    qty: it.quantity ?? 1,
    unit: it.unit || 'pcs',
    category,
    emoji: it.emoji || '📦',
    shelf: guessShelf(category),
    expiry: expiryFromNow(expiryDaysFor(category)),
  };
}

function directKnownItemsFromText(text: string) {
  const cleaned = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  // Sort longest aliases first so 'bell pepper' matches before 'pepper'.
  const sorted = [...KNOWN_ITEMS].sort((a, b) => b.alias.length - a.alias.length);
  const matches = sorted.filter(item => new RegExp(`\\b${item.alias}\\b`, 'i').test(cleaned));
  const deduped = matches.filter((item, index, list) => list.findIndex(v => v.canonical === item.canonical) === index);

  return deduped.map(item => ({
    name: item.canonical,
    qty: item.qty,
    unit: item.unit,
    category: item.category,
    emoji: item.emoji,
    shelf: guessShelf(item.category),
    expiry: expiryFromNow(expiryDaysFor(item.category)),
  }));
}

// Last-ditch fallback: split text on common separators and any whitespace,
// keep tokens that look like words (avoid numbers/units).
function whitespaceFallbackItems(text: string) {
  const cleanedTokens = text
    .toLowerCase()
    .replace(/[,;]|\band\b|\bthen\b|\bwith\b|\n|\bplus\b|\baur\b/gi, ' ')
    .split(/\s+/)
    .map(t => t.replace(/[^a-z]/g, '').trim())
    .filter(t => t.length >= 3 && !['the','and','some','need','have','want','add','for','few','box','bag','pack','kilo','gram','litre','liter'].includes(t));

  const seen = new Set<string>();
  return cleanedTokens
    .filter(t => { if (seen.has(t)) return false; seen.add(t); return true; })
    .map(name => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      qty: 1, unit: 'pcs', category: 'Other', emoji: '📦',
      shelf: guessShelf('Other'),
      expiry: expiryFromNow(expiryDaysFor('Other')),
    }));
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let textOnly = '';
    let lang = 'en-IN';
    let transcript = '';
    let audio: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      textOnly = ((formData.get('text') as string | null) || '').trim();
      lang = ((formData.get('lang') as string | null) || 'en-IN').trim();
      audio = (formData.get('audio') as File | null) || null;
    } else {
      const body = await req.json();
      textOnly = (body.text || '').trim();
      lang = body.lang || 'en-IN';
    }

    if (!OPENAI_KEY) {
      // Audio cannot be transcribed without a key — surface a clear error so the user knows why voice failed.
      if (audio && !textOnly) {
        return NextResponse.json({ error: 'OPENAI_API_KEY is not configured on the server. Set it in Vercel project settings to enable voice input.' }, { status: 500 });
      }
      const fallback = textOnly
        .split(/,|;|\band\b|\bthen\b|\bwith\b|\n/gi)
        .map(v => v.trim())
        .filter(Boolean)
        .map(name => ({ name, qty: 1, unit: 'pcs', category: 'Other', emoji: '📦', shelf: 'fridge', expiry: expiryFromNow(7) }));
      return NextResponse.json({ items: fallback, transcript: textOnly });
    }

    transcript = textOnly;

    if (audio && !textOnly) {
      const transcriptionForm = new FormData();
      transcriptionForm.append('file', audio);
      transcriptionForm.append('model', 'whisper-1');
      const whisperLang = lang.split('-')[0];
      if (whisperLang && whisperLang !== 'en') transcriptionForm.append('language', whisperLang);
      transcriptionForm.append('prompt', 'Grocery items list. Mixed English, Hindi, Tamil, Malay, Singlish, Arabic, or Spanish may appear.');

      const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
        body: transcriptionForm,
      });

      if (!transcriptionResponse.ok) {
        const errText = await transcriptionResponse.text();
        return NextResponse.json({ error: errText }, { status: 500 });
      }

      const transcriptionData = await transcriptionResponse.json();
      transcript = (transcriptionData.text || '').replace(/\s+/g, ' ').trim();
    }

    if (!transcript) return NextResponse.json({ items: [], transcript: '' });

    const directItems = directKnownItemsFromText(transcript);
    // If we have at least 2 direct matches, also include any unrecognised whitespace-separated
    // tokens as "Other" items. Saves a model call AND preserves words like "chole" that aren't
    // yet in the dictionary.
    if (directItems.length >= 2) {
      const matched = new Set(directItems.map(i => i.name.toLowerCase()));
      const matchedAliases = new Set<string>();
      const cleanedText = transcript.toLowerCase();
      for (const item of KNOWN_ITEMS) {
        if (new RegExp(`\\b${item.alias}\\b`, 'i').test(cleanedText)) matchedAliases.add(item.alias);
      }
      const extras = whitespaceFallbackItems(transcript)
        .filter(w => !matched.has(w.name.toLowerCase()) && !matchedAliases.has(w.name.toLowerCase()));
      return NextResponse.json({ items: [...directItems, ...extras], transcript });
    }

    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You extract grocery items from speech or text.
Return a JSON object with key "items" — an array of objects:
{ "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string }

Rules:
- item_name: keep one clean shopper-friendly name only. Never combine two groceries into one item.
- If the user says "bhindi pumpkin", "onion tomato", "milk eggs bread", or a similar list without commas, split them into separate grocery items.
- quantity: numeric and practical. Infer realistic household defaults when quantity is omitted.
- unit: "g" | "kg" | "ml" | "L" | "pcs" | "loaf" | "bunch" | "packet" | "dozen"
- category: "Produce" | "Dairy" | "Protein" | "Grains" | "Snacks" | "Beverages" | "Condiments" | "Frozen" | "Other"
- emoji: one relevant emoji
- Ignore filler words like "bought", "add", "need", "some", "aur", "und", "lah", "can"
- The user may mix languages or local dialects — still extract the groceries correctly.

Infer defaults when quantity is missing:
- bhindi / okra: 500 g
- pumpkin / kaddu: 1 kg
- tomato / tamatar: 4 pcs
- onion / pyaaz: 500 g
- potato / aloo: 1 kg
- spinach / palak / keerai: 1 bunch
- milk / doodh / paal / susu: 1 L
- eggs / muttai / telur / anda: 12 pcs
- bread / loaf: 1 loaf
- gobi / cauliflower: 1 pcs
- paneer: 200 g
- coriander / dhania: 1 bunch
- garlic / lehsun: 100 g
- ginger / adrak: 100 g

Locale hint: ${lang}`,
          },
          {
            role: 'user',
            content: `Extract grocery items from: "${transcript}"`,
          },
        ],
      }),
    });

    if (!completion.ok) {
      // OpenAI failed (quota / auth / rate limit). Don't drop the user's input —
      // fall back to direct matches, then to whitespace-split as "Other".
      if (directItems.length) return NextResponse.json({ items: directItems, transcript });
      const fallback = whitespaceFallbackItems(transcript);
      if (fallback.length) return NextResponse.json({ items: fallback, transcript, hint: 'AI parser is unavailable — items added without categories.' });
      const errText = await completion.text().catch(() => '');
      return NextResponse.json({ error: errText || 'Could not parse input.' }, { status: 500 });
    }

    const data = await completion.json();
    const content = JSON.parse(data.choices?.[0]?.message?.content || '{"items":[]}');
    let items = (content.items || []).map(normalizeItem).filter((item: { name: string }) => item.name);
    // Prefer direct matches if the model under-counted (e.g., returned 1 item for 4-word input).
    if (items.length < directItems.length) items = directItems;
    if (items.length === 1) {
      const retrySplit = directKnownItemsFromText(transcript);
      if (retrySplit.length > 1) items = retrySplit;
    }
    return NextResponse.json({ items, transcript });
  } catch (error) {
    console.error('Transcribe error:', error);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
