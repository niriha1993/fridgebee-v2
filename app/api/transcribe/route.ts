import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.Claude_API_Key || process.env.CLAUDE_API_KEY || '';
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

function normalizeItem(it: { item_name?: string; quantity?: number; unit?: string; category?: string; emoji?: string; price?: number; }) {
  const category = mapCategory(it.category);
  return {
    name: (it.item_name || '').trim(),
    qty: it.quantity ?? 1,
    unit: it.unit || 'pcs',
    category,
    emoji: it.emoji || '📦',
    shelf: guessShelf(category),
    // No expiry stamp — client uses expiryDaysForName for per-item shelf life.
    price: typeof it.price === 'number' && it.price > 0 ? it.price : undefined,
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
    // No expiry — client computes per-item via expiryDaysForName.
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
    .filter(t => t.length >= 3 && !['the','and','some','need','have','want','add','for','few','box','bag','pack','kilo','gram','litre','liter','dozen','pcs','pieces','piece','bunch','loaf','packet','grams','kilos','litres','liters','milliliter','milliliters','ml','oz','lb','lbs'].includes(t));

  const seen = new Set<string>();
  return cleanedTokens
    .filter(t => { if (seen.has(t)) return false; seen.add(t); return true; })
    .map(name => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      qty: 1, unit: 'pcs', category: 'Other', emoji: '📦',
      shelf: guessShelf('Other'),
      // expiry computed client-side
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
        .map(name => ({ name, qty: 1, unit: 'pcs', category: 'Other', emoji: '📦', shelf: 'fridge' }));
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
    // Direct-match shortcut: only when user hasn't specified explicit quantities.
    // If the text contains digits ("2 kg aloo") we must run the LLM so it can parse
    // them. Otherwise direct match is fine — saves a model call.
    const hasExplicitQty = /\d/.test(transcript);
    if (directItems.length >= 2 && !hasExplicitQty) {
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

    // Multi-language item-extraction prompt (ported from fridgebee.app/mise — battle-tested
     // on Hindi, Tamil, Malay, Singlish, Spanish, Arabic mixed input).
    const extractionPrompt = `You extract grocery items from speech or text.
Return a JSON object with key "items" — an array of objects:
{ "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string }

Rules:
- item_name: preserve the name in the language spoken. If the user said "Tamatar", use "Tamatar". If they said "Tomato", use "Tomato". Keep regional names authentic.
- quantity: numeric. Do NOT mindlessly default to 1 piece when the natural quantity differs.
- unit: "g" | "kg" | "ml" | "L" | "pcs" | "loaf" | "bunch" | "packet" | "dozen"
- category: "Produce" | "Dairy" | "Protein" | "Grains" | "Snacks" | "Beverages" | "Condiments" | "Frozen" | "Other"
- emoji: one relevant emoji
- Split lists like "bhindi pumpkin onion tomato" or "milk eggs bread" into separate grocery items even without commas.
- NEVER return quantity words as their own items. "1 dozen anda" → ONE item: Eggs (qty 12, unit pcs). Words like "dozen", "kg", "gram", "litre", "pack", "packet", "bunch", "loaf" are ALWAYS quantity qualifiers, never groceries.
- ALWAYS prefer the user-stated quantity over defaults. "500g methi" → Methi qty 500 unit g, NOT the default 1 bunch.
- Ignore filler words like "bought", "got", "picked up", "some", "aur", "y", "und", "lah", "can".
- The user may mix languages or local dialects — still extract the groceries correctly.

Infer practical household defaults when quantity is missing:
- tomato / tamatar / thakkali: 4 pcs
- onion / pyaaz / vengayam / bawang: 500 g
- potato / aloo / urulaikilangu / kentang: 1 kg
- spinach / keerai / palak: 1 bunch
- milk / doodh / paal / susu: 1 L
- eggs / muttai / telur / anda: 12 pcs
- bread / roti loaf: 1 loaf
- ginger / adrak / inji / halia: 100 g
- garlic / lehsun / poondu / bawang putih: 100 g
- cauliflower / gobi / phool gobi: 1 pcs
- paneer: 200 g
- coriander / dhania / cilantro: 1 bunch
- bhindi / okra: 500 g
- pumpkin / kaddu: 1 kg

Hindi: doodh=Milk, paneer=Paneer, aloo=Potato, pyaaz=Onion, dahi=Curd/Yogurt, atta=Flour, chawal=Rice, dal=Lentils, tamatar=Tomato, adrak=Ginger, lehsun=Garlic, sabzi=Vegetables, gosht=Meat, murgh=Chicken, machli=Fish, besan=Chickpea flour, maida=White flour, methi=Fenugreek, lauki=Bottle gourd, karela=Bitter gourd, baingan=Eggplant, gobi=Cauliflower, bhindi=Okra.
Tamil: thakkali=Tomato, paal=Milk, thayir=Curd/Yogurt, muttai=Eggs, vengayam=Onion, urulaikilangu=Potato, poondu=Garlic, inji=Ginger, keerai=Spinach, arisi=Rice, paruppu=Dal, kozhi=Chicken, meen=Fish, muttakose=Cabbage.
Malay/Singlish: susu=Milk, telur=Eggs, bawang=Onion, kentang=Potato, halia=Ginger, bawang putih=Garlic, sayur=Vegetables, ikan=Fish, ayam=Chicken, roti=Bread, kopi=Coffee, teh=Tea. Singlish: "buy one packet spinach lah", "need milk and eggs can?".
Spanish: leche=Milk, huevos=Eggs, pollo=Chicken, carne=Meat, arroz=Rice, frijoles=Beans, tomate=Tomato, cebolla=Onion, ajo=Garlic, pan=Bread, queso=Cheese, manzana=Apple, plátano=Banana, papa=Potato.
Arabic: laban=Milk, bayd=Eggs, dajaj=Chicken, lahm=Meat, ruz=Rice, khubz=Bread, jibn=Cheese, bassal=Onion, toom=Garlic.

User locale: ${lang}.

Return ONLY a JSON object — no markdown, no commentary.`;

    let extractedRaw = '';

    // Prefer Anthropic for the extraction call (their Sonnet 4.6 handles this prompt well).
    if (ANTHROPIC_KEY) {
      try {
        const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
        const r = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 700,
          system: extractionPrompt,
          messages: [{ role: 'user', content: `Extract grocery items from: "${transcript}"` }],
        });
        const tb = r.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
        extractedRaw = tb?.text ?? '';
      } catch { /* fall through to OpenAI */ }
    }

    if (!extractedRaw && OPENAI_KEY) {
      const completion = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 700,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: extractionPrompt },
            { role: 'user', content: `Extract grocery items from: "${transcript}"` },
          ],
        }),
      });
      if (completion.ok) {
        const data = await completion.json();
        extractedRaw = data.choices?.[0]?.message?.content || '';
      }
    }

    if (!extractedRaw) {
      // Both LLMs unavailable. Don't drop the user's input.
      if (directItems.length) return NextResponse.json({ items: directItems, transcript });
      const fallback = whitespaceFallbackItems(transcript);
      if (fallback.length) return NextResponse.json({ items: fallback, transcript, hint: 'AI parser is unavailable — items added without categories.' });
      return NextResponse.json({ error: 'Could not parse input.' }, { status: 500 });
    }

    // Strip markdown fencing if model returned it; extract first {...} object.
    const cleaned = extractedRaw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const content = (firstBrace >= 0 && lastBrace > firstBrace)
      ? JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
      : { items: [] };
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
