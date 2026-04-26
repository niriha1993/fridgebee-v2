// app/api/meals/route.ts
//
// Recipe generation — adapted from the original FridgeBee approach. Two key
// design choices that make this fast AND reliable:
//
//   1. We use gpt-4o-mini (1–2s typical) instead of a frontier reasoning model.
//      Recipe selection is a structured-output task; we don't need Sonnet-grade
//      reasoning, we need fast valid JSON.
//
//   2. We give the model a CURATED LIST of real named dishes per cuisine ×
//      meal-time and instruct it to PICK FROM that list. The model can't
//      hallucinate "Mango Dal Rice" because that string isn't in the list.
//      This kills the hallucination problem at the source rather than trying
//      to filter it out post-hoc.
//
// Anthropic remains as a fallback when OpenAI is unavailable or rate-limited.
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { fetchMealDBCandidates } from '@/lib/themealdb';
import { fetchEdamamCandidates } from '@/lib/edamam';

// Allow up to 25s — gives gpt-4o-mini time to respond even when OpenAI is slow.
// Default Vercel hobby tier is 10s which truncated valid responses.
export const maxDuration = 25;

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.Claude_API_Key || process.env.CLAUDE_API_KEY || '';
const MEALS_MODEL = process.env.OPENAI_MEALS_MODEL || 'gpt-4o-mini';

type Member = { name: string; isKid?: boolean; age?: number; dietaryFilters?: string[]; allergies?: string[]; dislikes?: string[] };
type Item = { name: string; qty: number; unit: string; expiry?: string };

const PERIOD_TIME: Record<string, string> = {
  breakfast: '7–9 AM breakfast',
  lunch:     '12–2 PM lunch',
  snack:     '4–5 PM snack',
  dinner:    '6–8 PM dinner',
};

// Curated real dishes per cuisine × meal-time. The AI picks from this list
// instead of inventing. Add to these freely — the model gets the union of
// all selected cuisines for the requested slot. ~12 per cell is the sweet
// spot: enough variety, short enough that the AI sees them all clearly.
// CUISINE_DISHES — curated, hand-picked real dishes per cuisine × meal-time.
// The AI picks FROM this list (combined with TheMealDB + Edamam) — it can't
// invent a name not on this list. Add freely; ~30+ dishes per cell is the
// sweet spot for variety + AI focus.
const CUISINE_DISHES: Record<string, Record<string, string[]>> = {
  // ── INDIAN (North + general) ────────────────────────────────────────────
  Indian: {
    breakfast: ['Poha', 'Suji Upma', 'Besan Chilla', 'Aloo Paratha', 'Paratha with Curd', 'Sabudana Khichdi', 'Idli with Sambar', 'Moong Dal Cheela', 'Bread Poha', 'Rava Dosa', 'Vermicelli Upma', 'Methi Thepla', 'Masala Omelette', 'Plain Dosa with Chutney', 'Onion Uttapam', 'Tomato Uttapam', 'Anda Bhurji', 'Paneer Bhurji', 'Sweet Potato Halwa', 'Gajar Halwa', 'Suji Halwa', 'Badam Halwa', 'Pumpkin Halwa', 'Beetroot Halwa', 'Banana Pancakes', 'Apple Cinnamon Oatmeal', 'Mango Smoothie', 'Yogurt Parfait', 'Palak Paratha', 'Gobi Paratha', 'Cabbage Paratha', 'Cheese Paratha', 'Sabudana Vada', 'Mini Idli with Ghee', 'Curd Rice (mild)', 'Sheera', 'Khaman Dhokla', 'Pesarattu', 'Akki Roti', 'Misal Pav', 'Methi Pulao'],
    lunch:     ['Dal Tadka with Rice', 'Rajma Chawal', 'Chole with Rice', 'Aloo Gobi with Roti', 'Palak Paneer with Roti', 'Matar Paneer with Rice', 'Kadhi Pakora with Rice', 'Baingan Bharta with Roti', 'Pav Bhaji', 'Jeera Rice with Dal', 'Mixed Veg Curry with Roti', 'Lauki Sabzi with Roti', 'Cabbage Sabzi with Roti', 'Bhindi Masala with Roti', 'Paneer Bhurji with Roti', 'Chana Masala with Rice', 'Vegetable Pulao', 'Khichdi with Curd', 'Tomato Rice', 'Curd Rice', 'Dosa with Sambar', 'Egg Curry with Rice', 'Chicken Curry with Rice', 'Fish Curry with Rice', 'Veg Biryani', 'Soya Chunk Curry with Rice', 'Mushroom Masala with Roti', 'Tinda Masala', 'Tindora Sabzi', 'Sev Tameta', 'Karela Sabzi', 'Aloo Beans', 'Stuffed Capsicum', 'Methi Aloo'],
    snack:     ['Bread Pakora', 'Aloo Chaat', 'Poha Chivda', 'Banana Shake', 'Roasted Chana', 'Sprouts Chaat', 'Makhana Chaat', 'Rava Idli', 'Dhokla', 'Masala Chai with Biscuits', 'Bhel Puri', 'Dahi Puri', 'Sev Puri', 'Vada Pav', 'Mango Lassi', 'Fruit Chaat', 'Cucumber Sandwich', 'Roasted Peanuts', 'Khandvi', 'Khaman', 'Kachori', 'Samosa', 'Pyaaz Pakora', 'Onion Bhaji', 'Bombay Sandwich'],
    dinner:    ['Dal Makhani with Roti', 'Chicken Curry with Rice', 'Mutton Curry with Rice', 'Paneer Butter Masala with Naan', 'Fish Curry with Rice', 'Egg Bhurji with Paratha', 'Vegetable Biryani', 'Chicken Biryani', 'Pulao with Raita', 'Aloo Methi Sabzi with Dal Rice', 'Bhindi Masala with Roti', 'Baingan Bharta with Roti', 'Cabbage Stir Fry with Roti', 'Mixed Veg Sabzi with Roti', 'Palak Paneer with Roti', 'Rajma Chawal', 'Khichdi with Pickle', 'Tomato Dal with Rice', 'Lauki Kofta with Rice', 'Malai Kofta with Naan', 'Kadai Paneer with Roti', 'Shahi Paneer with Naan', 'Butter Chicken with Naan', 'Tandoori Chicken', 'Mutton Rogan Josh', 'Hyderabadi Biryani', 'Lucknowi Biryani', 'Egg Curry with Roti', 'Aloo Tamatar with Roti', 'Soya Curry with Rice', 'Methi Malai Matar'],
  },

  // ── SOUTH INDIAN (treated as own cuisine; stronger coverage of TN/KA/Kerala)
  'South Indian': {
    breakfast: ['Idli with Sambar and Coconut Chutney', 'Plain Dosa with Chutney', 'Masala Dosa', 'Rava Dosa', 'Set Dosa', 'Mysore Masala Dosa', 'Onion Rava Dosa', 'Pongal', 'Ven Pongal', 'Sweet Pongal', 'Upma', 'Tomato Upma', 'Vegetable Upma', 'Pesarattu', 'Adai', 'Akki Roti', 'Ragi Mudde', 'Ragi Idli', 'Appam with Stew', 'Idiyappam with Coconut Milk', 'Puttu and Kadala Curry', 'Banana Buns', 'Pesarattu with Upma', 'Medu Vada with Sambar', 'Mini Idlis in Ghee', 'Kuzhi Paniyaram', 'Curd Vada', 'Lemon Rice'],
    lunch:     ['Sambar Rice with Papad', 'Rasam Rice', 'Curd Rice', 'Lemon Rice', 'Coconut Rice', 'Tomato Rice', 'Tamarind Rice (Puliyodarai)', 'Bisi Bele Bath', 'Vegetable Sambar with Rice', 'Avial with Rice', 'Kootu with Rice', 'Poriyal (Beans/Cabbage) with Rice', 'Thoran with Rice', 'Veg Pulao with Raita', 'Coconut Veg Curry with Rice', 'Andhra Chicken Curry with Rice', 'Kerala Fish Curry with Rice', 'Chettinad Chicken with Rice', 'Drumstick Sambar with Rice', 'Mushroom Pepper Fry with Rice', 'Banana Stem Poriyal'],
    snack:     ['Medu Vada', 'Masala Vada', 'Mysore Bonda', 'Banana Chips', 'Murukku', 'Mixture', 'Sundal', 'Rava Idli', 'Chakli', 'Filter Coffee with Biscuit', 'Bonda', 'Onion Pakoda'],
    dinner:    ['Chettinad Chicken with Rice', 'Kerala Fish Moilee with Rice', 'Andhra Mutton Curry with Rice', 'Veg Stew with Appam', 'Chicken Stew with Appam', 'Idiyappam with Egg Curry', 'Pesarattu with Tomato Chutney', 'Chicken Chettinad with Parotta', 'Mutton Pepper Fry', 'Kerala Egg Roast with Appam', 'Coconut Chicken Curry with Rice', 'Drumstick Sambar with Rice', 'Curd Rice with Pickle', 'Vegetable Korma with Rice', 'Kuzhambu with Rice'],
  },

  // ── EAST ASIAN (umbrella — Japanese baseline; Chinese/Korean live in their
  // own buckets below and fan-in via CUISINE_KEY_FANOUT).
  Asian: {
    breakfast: ['Congee', 'Soft Boiled Eggs on Toast', 'Miso Soup with Rice', 'Noodle Soup', 'Steamed Buns', 'Omelette Rice', 'Soft Tofu with Soy Sauce', 'Onigiri', 'Tamago Sando', 'Bao with Pickled Veg', 'Egg Drop Soup with Bread', 'Tamago Kake Gohan', 'Salmon Onigiri', 'Japanese Breakfast Set (Rice + Miso + Egg)', 'Natto with Rice'],
    lunch:     ['Vegetable Fried Rice', 'Chicken Fried Rice', 'Egg Fried Rice', 'Pad Thai', 'Stir-fried Noodles', 'Tom Yum Soup with Rice', 'Japanese Curry with Rice', 'Vietnamese Pho', 'Garlic Noodles', 'Veggie Stir-fry with Rice', 'Soba Noodle Bowl', 'Udon Soup', 'Tantanmen Ramen', 'Shoyu Ramen', 'Tonkotsu Ramen', 'Miso Ramen', 'Tom Kha Gai', 'Vietnamese Bun Cha', 'Bun Bo Hue', 'Banh Mi (Pork)', 'Banh Mi (Chicken)', 'Pho Bo (Beef)', 'Pho Ga (Chicken)', 'Thai Basil Chicken with Rice', 'Thai Green Curry with Rice', 'Thai Red Curry with Rice', 'Larb Gai', 'Filipino Adobo with Rice', 'Sinigang'],
    snack:     ['Edamame', 'Rice Crackers', 'Steamed Dumplings', 'Mango Sticky Rice', 'Spring Rolls', 'Cucumber Salad', 'Soy Glazed Peanuts', 'Asian Slaw', 'Tamagoyaki', 'Onigiri', 'Sushi Rolls (cucumber/avocado)', 'Vietnamese Summer Rolls', 'Thai Mango Salad'],
    dinner:    ['Stir-fried Vegetables with Rice', 'Steamed Fish with Ginger', 'Ginger Garlic Tofu Stir-fry', 'Cabbage Stir-fry with Rice', 'Honey Soy Salmon', 'Japanese Teriyaki Chicken', 'Japanese Tonkatsu', 'Chicken Katsu Curry', 'Donburi (Beef Bowl)', 'Donburi (Chicken Bowl)', 'Oyakodon', 'Gyudon', 'Katsudon', 'Yakitori', 'Yakisoba', 'Okonomiyaki', 'Takoyaki', 'Salmon Teriyaki', 'Vietnamese Caramel Pork (Thit Kho)', 'Thai Basil Beef', 'Thai Cashew Chicken', 'Filipino Sisig', 'Filipino Lechon Kawali'],
  },

  // ── CHINESE — own bucket; Han-Chinese cuisine across regional styles
  Chinese: {
    breakfast: ['Pork Congee', 'Chicken Congee', 'Plain Congee with Pickles', 'Youtiao with Soy Milk', 'Jianbing', 'Steamed Pork Buns (Char Siu Bao)', 'Steamed Vegetable Buns', 'Shengjianbao (Pan-fried Buns)', 'Scallion Pancakes', 'Spring Onion Pancakes', 'Egg Drop Soup with Bread', 'Chinese Rice Porridge', 'Cong You Bing'],
    lunch:     ['Yangzhou Fried Rice', 'Pork Fried Rice', 'Chicken Fried Rice', 'Char Siu Rice', 'Roast Duck Rice', 'Hong Shao Rou (Red-braised Pork) with Rice', 'Mapo Tofu with Rice', 'Kung Pao Chicken with Rice', 'Sweet and Sour Pork with Rice', 'Beef Chow Fun', 'Cantonese Chow Mein', 'Lo Mein', 'Wonton Noodle Soup', 'Dan Dan Noodles', 'Cold Sesame Noodles', 'Hakka Noodles', 'Singapore Noodles', 'Chow Fun', 'Sichuan Eggplant with Rice', 'Fish in Black Bean Sauce with Rice', 'Salt and Pepper Tofu with Rice', 'Egg Foo Young'],
    snack:     ['Pork Dumplings', 'Steamed Pork Buns', 'Char Siu Bao', 'Spring Rolls', 'Egg Tarts', 'Sesame Balls', 'Scallion Pancakes', 'Pot Stickers', 'Wontons in Chili Oil', 'Pork Buns'],
    dinner:    ['Peking Duck with Pancakes', 'Twice-cooked Pork', 'Sichuan Mapo Tofu', 'Sichuan Boiled Beef (Shui Zhu Niu)', 'Crispy Sichuan Eggplant', 'Kung Pao Chicken', 'Kung Pao Tofu', 'General Tso\'s Chicken', 'Orange Chicken', 'Beef and Broccoli', 'Beef in Black Bean Sauce', 'Pork and Cabbage Stir-fry', 'Five-spice Pork Belly', 'Char Siu with Rice', 'Pork Belly Rice Bowl', 'Salt and Pepper Pork', 'Salt and Pepper Squid', 'Honey Garlic Chicken', 'Cashew Chicken', 'Lap Cheong Rice', 'Chinese Hot Pot', 'Steamed Whole Fish with Ginger Scallion', 'Sweet and Sour Chicken', 'Sweet and Sour Pork', 'Mu Shu Pork', 'Chow Mein', 'Lo Mein', 'Yangzhou Fried Rice', 'Egg Foo Young', 'Mongolian Beef'],
  },

  // ── KOREAN — own bucket
  Korean: {
    breakfast: ['Kimchi Fried Rice', 'Korean Egg Roll (Gyeranmari)', 'Soy Bean Sprout Soup with Rice (Kongnamul Gukbap)', 'Korean Pancake (Pajeon)', 'Doenjang Soup with Rice', 'Tofu Soup with Rice', 'Rice with Banchan'],
    lunch:     ['Bibimbap', 'Dolsot Bibimbap', 'Bulgogi Bowl', 'Japchae', 'Tteokbokki', 'Kimchi Jjigae with Rice', 'Sundubu Jjigae (Soft Tofu Stew)', 'Doenjang Jjigae (Soybean Paste Stew)', 'Naengmyeon (Cold Noodles)', 'Bibim Naengmyeon', 'Korean Chicken Soup (Samgyetang)', 'Kimbap', 'Tuna Kimbap', 'Bulgogi Kimbap', 'Korean Beef and Rice Bowl'],
    snack:     ['Korean Fried Chicken (small)', 'Hotteok (Sweet Pancake)', 'Mandu (Korean Dumplings)', 'Tteokbokki (small)', 'Korean Corn Dogs', 'Hoeddeok'],
    dinner:    ['Bulgogi with Rice', 'Galbi (Korean Short Ribs)', 'Samgyeopsal (Pork Belly BBQ)', 'Kimchi Jjigae', 'Sundubu Jjigae', 'Doenjang Jjigae', 'Dakgalbi (Spicy Stir-fry Chicken)', 'Jeyuk Bokkeum (Spicy Pork Stir-fry)', 'Korean Fried Chicken', 'Yangnyeom Chicken', 'Dak Bulgogi (Chicken Bulgogi)', 'Korean BBQ Pork', 'Bibimbap', 'Dolsot Bibimbap', 'Japchae', 'Tteokbokki', 'Sundae (Korean Blood Sausage)', 'Galbi-jjim', 'Budae Jjigae (Army Stew)', 'Haemul Pajeon (Seafood Pancake)', 'Spicy Pork Bulgogi'],
  },

  // ── AMERICAN — own bucket; classic US comfort food + regional
  American: {
    breakfast: ['Pancakes with Maple Syrup', 'Blueberry Pancakes', 'Banana Pancakes', 'Buttermilk Pancakes', 'Waffles', 'Belgian Waffles', 'French Toast', 'Cinnamon French Toast', 'Eggs Benedict', 'Eggs Florentine', 'Bagel with Lox and Cream Cheese', 'Breakfast Burrito', 'Breakfast Sandwich', 'Sausage and Eggs', 'Bacon and Eggs', 'Hash Browns and Eggs', 'Biscuits and Gravy', 'Cinnamon Rolls', 'Blueberry Muffins', 'Egg Muffins', 'Avocado Toast', 'Smoothie Bowl', 'Acai Bowl', 'Overnight Oats', 'Granola with Yogurt'],
    lunch:     ['Cheeseburger', 'Bacon Cheeseburger', 'BLT Sandwich', 'Reuben Sandwich', 'Philly Cheesesteak', 'Lobster Roll', 'Cobb Salad', 'Caesar Salad', 'Chicken Caesar Wrap', 'Buffalo Chicken Wrap', 'Tuna Melt', 'Grilled Cheese with Tomato Soup', 'Mac and Cheese', 'Po\' Boy Sandwich', 'Patty Melt', 'Cuban Sandwich', 'Club Sandwich', 'Chicken Salad Sandwich', 'Tuna Salad Sandwich', 'Sloppy Joes', 'Hot Dogs', 'Chili Dogs', 'Chicken Caesar Salad', 'New England Clam Chowder', 'Manhattan Clam Chowder'],
    snack:     ['Buffalo Wings', 'Nachos', 'Loaded Nachos', 'Sliders', 'Onion Rings', 'Loaded Potato Skins', 'Pretzels with Mustard', 'Trail Mix', 'Mozzarella Sticks', 'Jalapeño Poppers', 'Deviled Eggs', 'Pigs in a Blanket', 'Spinach Artichoke Dip with Chips'],
    dinner:    ['Cheeseburger', 'BBQ Ribs', 'BBQ Chicken', 'Buffalo Wings', 'Mac and Cheese', 'Meatloaf with Mashed Potatoes', 'Pulled Pork Sandwich', 'Chicken Pot Pie', 'Beef Stew', 'Pot Roast', 'Chili Con Carne', 'Cajun Chicken Pasta', 'Jambalaya', 'Gumbo', 'Clam Chowder', 'Country Fried Steak', 'Salisbury Steak', 'Beef Tacos', 'Sloppy Joes', 'Philly Cheesesteak', 'Buffalo Chicken Pizza', 'Chicago Deep Dish Pizza', 'New York Pizza', 'BBQ Pulled Pork', 'Smoked Brisket', 'Ribeye Steak with Mashed Potatoes', 'NY Strip with Mac and Cheese', 'Crab Cakes', 'Cornbread with Chili', 'Fried Chicken with Biscuits', 'Nashville Hot Chicken', 'Grilled Salmon with Asparagus', 'Lobster Roll', 'Surf and Turf', 'Cheesy Baked Ziti', 'Lasagna (American style)', 'Stuffed Bell Peppers', 'Cajun Shrimp and Grits'],
  },

  // ── ITALIAN — own bucket (split from broad Mediterranean)
  Italian: {
    breakfast: ['Cornetto with Cappuccino', 'Ricotta Pancakes', 'Italian Egg Frittata', 'Caprese Toast', 'Bombolone with Coffee', 'Yogurt with Honey and Granola', 'Crostata di Marmellata'],
    lunch:     ['Margherita Pizza', 'Pepperoni Pizza', 'Quattro Formaggi Pizza', 'Calzone', 'Caprese Salad', 'Caprese Sandwich', 'Bruschetta with Tomatoes', 'Spaghetti Aglio e Olio', 'Penne Arrabbiata', 'Pesto Pasta', 'Penne Pomodoro', 'Cacio e Pepe', 'Spaghetti Carbonara', 'Risotto Milanese', 'Risotto ai Funghi', 'Minestrone Soup', 'Italian Wedding Soup', 'Pasta e Fagioli', 'Insalata Caprese', 'Pasta Salad'],
    snack:     ['Bruschetta', 'Caprese Skewers', 'Arancini', 'Italian Olive Plate', 'Focaccia', 'Italian Antipasto Plate', 'Prosciutto and Melon', 'Marinated Olives'],
    dinner:    ['Spaghetti Bolognese', 'Lasagna Bolognese', 'Chicken Parmesan', 'Eggplant Parmesan', 'Veal Parmigiana', 'Ossobuco with Risotto', 'Saltimbocca', 'Pollo Cacciatore', 'Linguine alle Vongole', 'Spaghetti Carbonara', 'Fettuccine Alfredo', 'Penne all\'Arrabbiata', 'Mushroom Risotto', 'Italian Sausage Pasta', 'Pasta Pomodoro', 'Margherita Pizza', 'Calzone', 'Veal Marsala', 'Beef Carpaccio', 'Pasta Puttanesca', 'Spaghetti alle Vongole', 'Lobster Ravioli', 'Spinach and Ricotta Cannelloni', 'Italian Meatballs with Spaghetti', 'Risotto al Nero di Seppia', 'Tiramisu (dessert)'],
  },

  // ── SINGAPOREAN / SE ASIAN — own cuisine for SG market
  Singaporean: {
    breakfast: ['Kaya Toast with Eggs', 'Soft Boiled Eggs', 'Chwee Kueh', 'Mee Rebus (light)', 'Roti Prata with Curry', 'Roti Prata with Egg', 'Putu Mayam', 'Nasi Lemak (small)', 'Bee Hoon Goreng', 'Bao with Egg'],
    lunch:     ['Hainanese Chicken Rice', 'Char Kway Teow', 'Hokkien Mee', 'Mee Goreng', 'Mee Rebus', 'Bak Kut Teh with Rice', 'Laksa', 'Curry Laksa', 'Nasi Lemak', 'Nasi Goreng', 'Wonton Mee', 'Fishball Noodles', 'Chicken Rice Bowl', 'Char Siu Rice', 'Roti Prata with Curry', 'Murtabak', 'Mee Pok', 'Yong Tau Foo', 'Carrot Cake (Chai Tow Kway)', 'Fried Hokkien Prawn Mee'],
    snack:     ['Curry Puff', 'Otak Otak', 'Popiah', 'Chwee Kueh', 'Soya Bean Curd (Tau Huay)', 'Pulut Hitam', 'Cheng Tng', 'Ice Kachang', 'Bee Hoon Goreng (small)', 'Roti John'],
    dinner:    ['Chilli Crab', 'Black Pepper Crab', 'Bak Kut Teh', 'Hainanese Chicken Rice', 'Char Kway Teow', 'Hokkien Prawn Mee', 'Beef Rendang with Rice', 'Sambal Stingray', 'Chicken Satay with Peanut Sauce', 'Beef Satay', 'Fish Head Curry', 'Curry Chicken with Rice', 'Mee Goreng with Pork', 'Nasi Goreng with Egg', 'Sambal Kangkong', 'Stir-fried Sambal Beans', 'Cereal Prawns', 'Salted Egg Yolk Chicken', 'Salted Egg Yolk Prawns', 'Sweet and Sour Pork', 'Char Siu Pork', 'Chap Chye'],
  },

  // ── WESTERN (general; American + Continental)
  Western: {
    breakfast: ['Scrambled Eggs on Toast', 'Cheese Omelette', 'Avocado Toast', 'French Toast', 'Pancakes', 'Blueberry Pancakes', 'Banana Pancakes', 'Granola with Yogurt', 'Banana Oat Smoothie', 'Spinach Omelette', 'Mushroom Omelette', 'Yogurt Parfait', 'Veggie Hash', 'Eggs Benedict', 'Eggs Florentine', 'Bacon and Eggs', 'Sausage and Eggs', 'Breakfast Burrito', 'Cinnamon French Toast', 'Bagel with Cream Cheese', 'Smashed Avocado on Toast', 'Smoothie Bowl', 'Acai Bowl', 'Overnight Oats', 'Egg Muffins', 'Breakfast Sandwich'],
    lunch:     ['Grilled Chicken Sandwich', 'Caesar Salad', 'Cobb Salad', 'Tomato Soup with Bread', 'Pasta Salad', 'BLT Wrap', 'Veggie Wrap', 'Greek Salad with Pita', 'Caprese Sandwich', 'Tuna Salad Sandwich', 'Pesto Pasta', 'Aglio e Olio', 'Margherita Pizza', 'Pepperoni Pizza', 'Veggie Quesadilla', 'Mushroom Risotto', 'Reuben Sandwich', 'Club Sandwich', 'Turkey Wrap', 'Chicken Caesar Wrap', 'Buffalo Chicken Wrap', 'Sloppy Joes', 'Mac and Cheese', 'Chicken Noodle Soup', 'Tomato Basil Soup', 'Minestrone Soup', 'French Onion Soup', 'Quiche Lorraine', 'Veggie Quiche'],
    snack:     ['Apple with Peanut Butter', 'Greek Yogurt with Honey', 'Cheese and Crackers', 'Banana Smoothie', 'Boiled Eggs', 'Carrot Sticks with Hummus', 'Trail Mix', 'Bruschetta', 'Deviled Eggs', 'Caprese Skewers', 'Veggie Sticks with Ranch', 'Cheese Toastie'],
    dinner:    ['Spaghetti Bolognese', 'Roast Chicken with Vegetables', 'Grilled Salmon with Lemon', 'Beef Stir-fry', 'Pasta Carbonara', 'Chicken Stew', 'Baked Potato with Toppings', 'Mushroom Risotto', 'Grilled Cheese with Tomato Soup', 'Stuffed Bell Peppers', 'Pasta Primavera', 'Lemon Herb Chicken', 'Vegetable Lasagna', 'Beef Lasagna', 'Chicken Parmesan', 'Steak with Mashed Potatoes', 'Grilled Pork Chops', 'Roast Beef with Yorkshire Pudding', 'Meatloaf with Mashed Potatoes', 'BBQ Ribs', 'BBQ Chicken', 'Buffalo Wings', 'Mac and Cheese', 'Chili Con Carne', 'Beef Stroganoff', 'Pot Roast', 'Chicken Pot Pie', 'Shepherd\'s Pie', 'Pulled Pork Sandwich', 'Cheeseburger', 'Veggie Burger'],
  },

  // ── BRITISH — own cuisine
  British: {
    breakfast: ['Full English Breakfast', 'Eggs and Beans on Toast', 'Bacon Butty', 'Sausage Sandwich', 'Black Pudding with Eggs', 'Kippers on Toast', 'Smoked Salmon and Scrambled Eggs', 'Welsh Rarebit', 'Beans on Toast', 'Crumpets with Butter', 'Marmalade Toast', 'Porridge with Berries'],
    lunch:     ['Ploughman\'s Lunch', 'Cornish Pasty', 'Sausage Roll', 'Cheese and Pickle Sandwich', 'Coronation Chicken Sandwich', 'Jacket Potato with Beans', 'Jacket Potato with Cheese', 'Soup of the Day with Bread', 'Welsh Rarebit', 'Bubble and Squeak', 'Pork Pie with Salad'],
    snack:     ['Scones with Jam and Cream', 'Tea and Biscuits', 'Crumpets', 'Welsh Cakes', 'Eccles Cakes', 'Sausage Roll', 'Mini Cornish Pasty'],
    dinner:    ['Fish and Chips', 'Sunday Roast (Beef)', 'Sunday Roast (Chicken)', 'Sunday Roast (Lamb)', 'Shepherd\'s Pie', 'Cottage Pie', 'Steak and Ale Pie', 'Chicken and Mushroom Pie', 'Bangers and Mash', 'Toad in the Hole', 'Cumberland Sausage with Mash', 'Beef Wellington', 'Lancashire Hotpot', 'Chicken Tikka Masala', 'Beef Stew with Dumplings', 'Kedgeree', 'Lamb Chops with Mint Sauce', 'Roast Lamb with Mint Jelly', 'Yorkshire Pudding with Roast', 'Steak and Kidney Pie', 'Cumberland Pie'],
  },

  // ── FRENCH — own cuisine
  French: {
    breakfast: ['Croissant with Butter and Jam', 'Pain au Chocolat', 'Pain au Raisin', 'Crepes with Nutella', 'Crepes with Banana', 'French Toast (Pain Perdu)', 'Café au Lait with Baguette', 'Brioche with Honey', 'Tartine with Jam', 'Madeleines with Tea', 'Buckwheat Galette', 'Omelette aux Fines Herbes'],
    lunch:     ['Croque Monsieur', 'Croque Madame', 'Quiche Lorraine', 'Niçoise Salad', 'Salade Lyonnaise', 'French Onion Soup with Baguette', 'Tartine with Goat Cheese', 'Chicken Caesar (Parisian style)', 'Pissaladière', 'Soupe au Pistou', 'Buckwheat Galette', 'Crêpe Complète'],
    snack:     ['Tarte Tatin', 'Madeleine', 'Macaron', 'Éclair', 'Croissant', 'Pain au Chocolat', 'Crepes', 'Cheese and Baguette'],
    dinner:    ['Coq au Vin', 'Beef Bourguignon', 'Ratatouille', 'Cassoulet', 'Bouillabaisse', 'Steak Frites', 'Duck Confit', 'Roast Lamb with Herbs', 'Poulet Rôti', 'Sole Meunière', 'Mussels Marinière', 'Tarte aux Tomates', 'Pissaladière', 'Salmon en Papillote', 'Veal Blanquette', 'Quiche Lorraine', 'Niçoise Salad', 'Onion Soup', 'Pot-au-Feu', 'Gratin Dauphinois', 'Provencal Stuffed Tomatoes'],
  },

  // ── MEXICAN / LATIN
  Mexican: {
    breakfast: ['Huevos Rancheros', 'Chilaquiles', 'Egg Tacos', 'Avocado Toast with Salsa', 'Bean Burrito', 'Breakfast Burrito', 'Mexican Scrambled Eggs', 'Nopales Tacos', 'Migas', 'Atole'],
    lunch:     ['Chicken Quesadilla', 'Bean and Rice Bowl', 'Fish Tacos', 'Veggie Wrap', 'Burrito Bowl', 'Black Bean Tacos', 'Corn and Bean Salad', 'Tortilla Soup', 'Pollo Asado Bowl', 'Carnitas Tacos', 'Carne Asada Tacos', 'Shrimp Tacos', 'Tinga Tostadas', 'Cuban Sandwich'],
    snack:     ['Guacamole with Tortilla Chips', 'Corn on the Cob (Elote)', 'Fruit Salad', 'Mango with Lime and Chili', 'Tortilla Chips with Salsa', 'Esquites', 'Quesadilla Bites'],
    dinner:    ['Chicken Fajitas', 'Beef Tacos', 'Lentil Soup', 'Black Bean Enchiladas', 'Chicken Burrito Bowl', 'Vegetarian Chili', 'Stuffed Peppers (Chile Relleno)', 'Cheese Quesadilla', 'Chicken Mole', 'Beef Barbacoa', 'Pork Carnitas', 'Tamales', 'Pollo en Salsa Verde', 'Cochinita Pibil', 'Ropa Vieja (Cuban)', 'Arroz con Pollo', 'Empanadas (Beef/Chicken)', 'Cuban Black Beans and Rice', 'Pernil (Roast Pork)'],
  },

  // ── MEDITERRANEAN (Greek / Italian / Levantine)
  Mediterranean: {
    breakfast: ['Greek Yogurt with Honey', 'Shakshuka', 'Hummus Toast with Eggs', 'Olive Oil Toast with Tomato', 'Mediterranean Veggie Omelette', 'Labneh with Olive Oil', 'Manakish Za\'atar', 'Foul Medames', 'Spinach and Feta Bourekas', 'Halloumi with Eggs'],
    lunch:     ['Greek Salad', 'Falafel Wrap', 'Lentil Soup', 'Tabbouleh with Pita', 'Hummus Plate with Pita', 'Tomato Cucumber Salad', 'Tuna Niçoise Salad', 'Spanakopita', 'Pita with Hummus and Veg', 'Chicken Souvlaki Wrap', 'Italian Caprese Salad', 'Chicken Caesar (Italian style)', 'Penne Arrabbiata', 'Spaghetti Aglio e Olio', 'Penne Pomodoro', 'Margherita Pizza', 'Bruschetta with Tomatoes'],
    snack:     ['Hummus with Vegetables', 'Olives and Feta', 'Fruit and Nuts', 'Stuffed Grape Leaves', 'Pita Chips with Tzatziki', 'Babaganoush with Pita', 'Bruschetta', 'Caprese Skewers', 'Marinated Olives', 'Roasted Almonds'],
    dinner:    ['Grilled Fish with Lemon', 'Chicken Shawarma', 'Pasta with Olives and Tomatoes', 'Stuffed Bell Peppers', 'Roasted Vegetable Couscous', 'Lemon Herb Chicken with Rice', 'Mediterranean Veggie Stew', 'Lentil and Spinach Stew', 'Moussaka', 'Pastitsio', 'Souvlaki with Tzatziki', 'Greek Lemon Chicken', 'Chicken Shawarma Plate', 'Lamb Kofta with Rice', 'Lamb Kebabs', 'Beef Kebabs', 'Mansaf (Lamb with Rice)', 'Ossobuco with Risotto', 'Italian Lasagna', 'Risotto Milanese', 'Spaghetti Carbonara', 'Penne all\'Arrabbiata', 'Chicken Cacciatore', 'Italian Sausage Pasta', 'Eggplant Parmesan', 'Italian Wedding Soup'],
  },
};

// Map v2's 5 onboarding cuisine pills → 1-to-N fan-out into the curated dish
// buckets. Onboarding stays simple (5 pills), but every macro-pick pulls a
// rich union of sub-cuisines so the AI picks from a much wider pool.
//
//   Indian        → Indian + South Indian
//   East Asian    → Asian (JP base) + Chinese + Korean + Singaporean
//   Western       → Western (general) + American + British + French
//   Mediterranean → Mediterranean (Greek/Levantine) + Italian
//   Latin         → Mexican
//
// Users who type a sub-cuisine directly (e.g. "Korean") still match because
// the resolver below falls through with the original key.
const CUISINE_KEY_FANOUT: Record<string, string[]> = {
  'Indian':        ['Indian', 'South Indian'],
  'East Asian':    ['Asian', 'Chinese', 'Korean', 'Singaporean'],
  'Western':       ['Western', 'American', 'British', 'French'],
  'Mediterranean': ['Mediterranean', 'Italian'],
  'Latin':         ['Mexican'],
};

// Default cuisine inferred from country when the user hasn't picked one.
function defaultCuisineForCountry(country?: string): string {
  if (country === 'IN' || country === 'PK') return 'Indian';
  if (country === 'SG' || country === 'MY') return 'Asian';
  if (country === 'AE') return 'Mediterranean';
  return 'Western';
}

// Spice/condiment staples — never listed in the fridge UI; the AI assumes them.
const STAPLE_NAMES = new Set([
  'salt','sugar','oil','olive oil','sunflower oil','cooking oil','water','vinegar',
  'black pepper','pepper','cumin','turmeric','chilli powder','garam masala','cardamom',
  'cinnamon','bay leaf','mustard seeds','asafoetida','hing',
]);

// STAPLE_PANTRY — items most households keep stocked in the dry pantry but
// don't enter into the fridge UI (they're not perishable). The recipe matcher
// treats these as IF they were in the fridge, so dishes like "Suji Upma"
// qualify when the user has onions/tomato but no sooji entry. Without this,
// 80% of breakfast/snack recipes would never get suggested.
//
// Includes hero staples + their common aliases so the fridge-token matcher
// (which does prefix/contains checks) catches all variants.
const STAPLE_PANTRY = new Set([
  // Indian dry pantry
  'sooji','suji','rava','semolina',
  'atta','wheat flour','whole wheat flour','maida','all-purpose flour','flour',
  'besan','gram flour','chickpea flour',
  'poha','flattened rice',
  'sabudana','sago','tapioca pearls',
  'vermicelli','sevai',
  'rice','basmati','basmati rice','idli rava','dosa batter',
  'dal','toor dal','moong dal','masoor dal','chana dal','urad dal','lentils',
  'rajma','kidney beans','chana','chickpeas','black chickpeas','kabuli chana',
  'oats','rolled oats','steel cut oats','muesli','granola',
  'quinoa','couscous','bulgur','barley',
  // Global dry / canned pantry
  'pasta','spaghetti','penne','fusilli','macaroni','noodles','ramen','udon','soba',
  'bread','baguette','pita','tortilla','tortillas','wraps','buns',
  'butter','ghee','milk','yogurt','curd',
  'cheese','cheddar','mozzarella','parmesan','feta','paneer',
  'eggs','egg',
  'tomato sauce','pasta sauce','tomato paste','passata',
  'soy sauce','sesame oil','fish sauce','oyster sauce','hoisin','rice vinegar',
  'coconut milk','coconut cream',
  'stock','broth','chicken stock','vegetable stock',
  'beans','black beans','red beans','baked beans','cannellini','chickpeas',
  'corn','sweet corn',
  'breadcrumbs','panko',
  'honey','maple syrup','jam','peanut butter','tahini',
  // Aromatics typically always stocked
  'onion','onions','garlic','ginger','green chilli','green chillies','curry leaves','coriander','cilantro',
]);

function describeFridge(items: Item[]) {
  const arr = items.filter(i => !STAPLE_NAMES.has(i.name.toLowerCase().trim()));
  if (!arr.length) return { expiring: '', fresh: '', all: '' };
  const today = new Date().toISOString().split('T')[0];
  const sorted = [...arr].sort((a, b) => (a.expiry || '99').localeCompare(b.expiry || '99'));
  const expiring = sorted.filter(i => i.expiry && i.expiry <= today);
  const fresh = sorted.filter(i => !i.expiry || i.expiry > today);
  const fmt = (i: Item) => `${i.name}(${i.qty}${i.unit})`;
  return {
    expiring: expiring.slice(0, 8).map(fmt).join(', '),
    fresh: fresh.slice(0, 14).map(fmt).join(', '),
    all: sorted.slice(0, 18).map(i => i.name).join(', '),
  };
}

function describeMembers(members?: Member[]) {
  if (!members?.length) return { dietCtx: 'omnivore', familySize: 1, hasKid: false, kidName: '' };
  const allDiets: string[] = members.flatMap(m => m.dietaryFilters || []);
  const isVeg = allDiets.includes('Vegetarian') || allDiets.includes('Vegan');
  const isVegan = allDiets.includes('Vegan');
  const isPescatarian = allDiets.includes('Pescatarian');
  const isHalal = allDiets.includes('Halal');
  const isNonHalal = allDiets.includes('Non-halal');
  const noBeef = allDiets.includes('No beef');
  const isKosher = allDiets.includes('Kosher');
  const allergies = Array.from(new Set(members.flatMap(m => m.allergies || [])));
  const kid = members.find(m => m.isKid || (m.age != null && m.age < 12));
  const parts: string[] = [];
  if (isVegan) parts.push('STRICT VEGAN — no animal products at all (no dairy, eggs, honey, fish, or meat)');
  else if (isVeg) parts.push('STRICT VEGETARIAN — no meat, fish, or chicken; eggs and dairy OK');
  else if (isPescatarian) parts.push('PESCATARIAN — fish & seafood OK, no land meat (no chicken, beef, pork, lamb)');
  else parts.push('omnivore (meat OK)');
  if (isHalal) parts.push('HALAL — no pork, no alcohol-cooked dishes, no bacon/ham/lard');
  if (isNonHalal) parts.push('NON-HALAL — actively prefers pork-using dishes (Char Siu, Bak Kut Teh, Lap Cheong, etc.). Default to including these when ingredients fit.');
  if (isKosher) parts.push('KOSHER — no pork, no shellfish, no mixing meat with dairy in the same dish');
  if (noBeef) parts.push('NO BEEF — avoid beef and beef-derived ingredients (Hindu rules)');
  if (kid) parts.push(`${kid.name || 'child'} present (age ${kid.age ?? 'kid'}) — ALL dishes must be child-safe: mild spice, soft texture, no choking hazards`);
  if (allergies.length) parts.push(`ALLERGIES (strict avoid): ${allergies.join(', ')}`);
  return {
    dietCtx: parts.join(' | '),
    familySize: members.length,
    hasKid: !!kid,
    kidName: kid?.name?.trim() || '',
  };
}

// V2's expected meal shape — matches what the client renders.
type V2Meal = {
  name: string;
  emoji: string;
  description: string;
  cookTime: number;
  kcal: number;
  protein: number;
  mealType: string;
  usesExpiring: boolean;
  safeFor: string[];
  ingredients: string[];
  steps: string[];
  tags: string[];
};

// Rough guess fallback when both AI providers fail. Three real dishes built
// from whatever the user has.
function makeFallbackMeals(items: Item[], slot: string, kidName: string): V2Meal[] {
  const usable = items.slice(0, 5);
  const main = usable[0]?.name || 'vegetables';
  const second = usable[1]?.name;
  const ingNames = usable.slice(0, 4).map(i => `${i.name} ${i.qty}${i.unit}`);
  const safeFor = kidName ? [kidName] : [];
  const baseSteps = [
    'Wash and prep the fridge ingredients.',
    'Cook gently with oil, salt, and basic spices until tender.',
    'Taste, adjust seasoning, and serve warm.',
  ];
  return [
    {
      name: `${main}${second ? ` and ${second}` : ''} skillet`,
      emoji: '🍳', description: `Quick ${slot} using what's already in the fridge.`,
      cookTime: 15, kcal: 320, protein: 12, mealType: slot, usesExpiring: true,
      safeFor, ingredients: ingNames, steps: baseSteps, tags: ['quick', slot],
    },
    {
      name: `${main} rice bowl`,
      emoji: '🍚', description: `Simple rice bowl with ${main}.`,
      cookTime: 20, kcal: 390, protein: 10, mealType: slot, usesExpiring: true,
      safeFor, ingredients: ['Rice 1 cup', ...ingNames], steps: ['Cook rice or use leftover rice.', ...baseSteps.slice(0, 2), 'Serve over rice.'], tags: ['easy', slot],
    },
    {
      name: `${main} soup`,
      emoji: '🥣', description: 'Comforting soup using soft fridge items.',
      cookTime: 25, kcal: 280, protein: 9, mealType: slot, usesExpiring: true,
      safeFor, ingredients: ingNames, steps: ['Chop ingredients small.', 'Simmer with water, salt, and mild spices until soft.', 'Serve hot.'], tags: ['soup', slot],
    },
  ];
}

function buildPrompt(args: {
  slot: string;
  count: number;
  cuisineKeys: string[];
  dishList: string[];
  fridge: ReturnType<typeof describeFridge>;
  member: ReturnType<typeof describeMembers>;
  exclude: string[];
}) {
  const { slot, count, cuisineKeys, dishList, fridge, member, exclude } = args;
  const cuisineLine = cuisineKeys.length === 1
    ? `Cuisine: ${cuisineKeys[0]}.`
    : `Cuisines: ${cuisineKeys.join(' or ')}.`;
  return `Generate exactly ${count} ${PERIOD_TIME[slot] || slot} meal suggestions for ${member.familySize} ${member.familySize === 1 ? 'person' : 'people'}.

${cuisineLine}
PICK ONLY FROM THIS PRE-FILTERED DISH LIST (these are dishes the user CAN make from their fridge — do not pick anything outside this list, do not invent new dishes):
${dishList.join(', ')}

EVERY recipe must use AT LEAST ONE hero ingredient from the user's fridge (listed below). If a dish on the list above doesn't have a fridge ingredient as its main, skip it. Return fewer than ${count} rather than fabricate.

DIET / FAMILY: ${member.dietCtx}
${exclude.length ? `EXCLUDE these recently-cooked: ${exclude.slice(0, 10).join(', ')}` : ''}

ALWAYS available (do NOT require these to be in the fridge): water, salt, pepper, oil, basic spices (cumin, turmeric, chilli powder, garam masala, mustard seeds), onion, garlic, ginger, sugar.

EXPIRING (use these first): ${fridge.expiring || 'none'}
FRIDGE (fresh): ${fridge.fresh || 'none'}

RULES:
1. Build each recipe AROUND a fridge item from above. Don't suggest a dish whose hero (paneer, chicken, fish, tofu, bhindi, methi, aloo, etc.) isn't in the fridge.
2. Prioritise dishes that use EXPIRING items.
3. Each recipe must be DIFFERENT (different main, different technique).
4. Steps must be short and practical — max 5 steps.
5. ${member.hasKid ? `Every dish must be safe for ${member.kidName || 'the child'} — mild spice, soft texture, nothing whole and choke-able.` : 'Pick at least one quick low-effort option.'}

Return JSON: { "meals": [...] } with each meal:
{
  "name": "string (must be from the dish list above)",
  "emoji": "single emoji",
  "description": "one-sentence description",
  "cookTime": number_minutes,
  "kcal": number,
  "protein": number_grams,
  "mealType": "${slot}",
  "usesExpiring": true_if_uses_an_item_expiring_today_or_tomorrow,
  "safeFor": ${member.kidName ? `["${member.kidName}"]_if_kid_safe_else_empty_array` : '[]'},
  "ingredients": ["Name qty unit", ...],
  "steps": ["short step", ...],
  "tags": ["tag1", "tag2"]
}`;
}

async function generateWithOpenAI(systemContent: string, userPrompt: string): Promise<V2Meal[]> {
  const openai = new OpenAI({ apiKey: OPENAI_KEY });
  // 3 recipes × ~200 tokens output = ~600 tokens. 1500 leaves headroom and
  // keeps generation snappy. Bigger max_tokens makes the model take longer
  // even when actual output is short.
  const completion = await openai.chat.completions.create({
    model: MEALS_MODEL,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userPrompt },
    ],
  });
  const raw = completion.choices[0]?.message?.content || '{"meals":[]}';
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.meals) ? parsed.meals : [];
}

async function generateWithAnthropic(systemContent: string, userPrompt: string): Promise<V2Meal[]> {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemContent,
    messages: [{ role: 'user', content: `${userPrompt}\n\nReturn ONLY the JSON object, no markdown fencing.` }],
  });
  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const raw = (block?.text || '').replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace === -1) return [];
  const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  return Array.isArray(parsed.meals) ? parsed.meals : [];
}

export async function POST(req: NextRequest) {
  try {
    const { items, cuisines, members, mealType, excludeMeals, count, country, recipeName } = await req.json();
    const slot = (typeof mealType === 'string' && PERIOD_TIME[mealType.toLowerCase()]) ? mealType.toLowerCase() : 'dinner';
    const wantedCount = typeof count === 'number' && count > 0 ? Math.min(count, 6) : 3;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ meals: [] });
    }

    if (!OPENAI_KEY && !ANTHROPIC_KEY) {
      return NextResponse.json({ meals: [], error: 'No AI provider configured' });
    }

    // ── DEEP-LINK FAST PATH ────────────────────────────────────────────────
    // When a push notification is tapped, we open `/?tab=meals&recipe=<name>`
    // and the page hits this route with `recipeName` set. Skip the curated
    // dish list / multi-recipe ranking entirely — just generate exactly that
    // one recipe in the V2Meal shape so the recipeScreen can render it cold.
    if (typeof recipeName === 'string' && recipeName.trim()) {
      const member = describeMembers(members);
      const fridge = describeFridge(items);
      const singlePrompt = `Generate the recipe "${recipeName.trim()}" as one entry in JSON.

DIET / FAMILY: ${member.dietCtx}
FRIDGE (use as much as possible): ${fridge.fresh || 'sparse'}
EXPIRING (use first if relevant): ${fridge.expiring || 'none'}

ALWAYS available (do NOT require these in the fridge): water, salt, pepper, oil, basic spices (cumin, turmeric, chilli powder, garam masala, mustard seeds), onion, garlic, ginger, sugar, sooji, atta, maida, basmati rice, dal, oats, vermicelli, sabudana, poha, pasta, bread, milk, butter, eggs.

Return JSON: { "meals": [ <one meal object> ] } where the meal has shape:
{
  "name": "${recipeName.trim()}",
  "emoji": "single emoji",
  "description": "one-sentence description",
  "cookTime": number_minutes,
  "kcal": number,
  "protein": number_grams,
  "mealType": "${slot}",
  "usesExpiring": true_if_recipe_uses_an_expiring_item,
  "safeFor": ${member.kidName ? `["${member.kidName}"]_if_kid_safe_else_empty_array` : '[]'},
  "ingredients": ["Name qty unit", ...],
  "steps": ["short step", "short step", ...],
  "tags": ["tag1", "tag2"]
}
Steps must be max 6, short and practical. ${member.hasKid ? 'Mild spice and kid-safe.' : ''}`;
      const sysSingle = 'You are a precise recipe generator. Output a single recipe matching the requested name exactly.';
      try {
        let single: V2Meal[] = [];
        if (OPENAI_KEY) single = await generateWithOpenAI(sysSingle, singlePrompt);
        if (!single.length && ANTHROPIC_KEY) single = await generateWithAnthropic(sysSingle, singlePrompt);
        if (single.length) {
          // Force the name to match the requested one — guarantees the page
          // can find it after fetch even if the AI rephrased slightly.
          single[0].name = recipeName.trim();
          return NextResponse.json({ meals: [single[0]] });
        }
      } catch { /* fall through to standard path */ }
      // AI failed — return a fallback shaped entry so the screen still opens.
      const safeFor = member.kidName ? [member.kidName] : [];
      const fallback: V2Meal = {
        name: recipeName.trim(),
        emoji: '🍳',
        description: `${recipeName.trim()} — open FridgeBee to refresh and see full steps.`,
        cookTime: 25, kcal: 350, protein: 12,
        mealType: slot, usesExpiring: false,
        safeFor,
        ingredients: items.slice(0, 5).map((i: Item) => `${i.name} ${i.qty}${i.unit}`),
        steps: ['Prep your fridge ingredients.', 'Cook gently with oil and seasoning.', 'Taste, adjust, and serve warm.'],
        tags: ['quick', slot],
      };
      return NextResponse.json({ meals: [fallback] });
    }

    // Resolve cuisine choice → curated dish list. Each onboarding pill
    // fans-out into multiple sub-cuisines via CUISINE_KEY_FANOUT (e.g.
    // "East Asian" → Asian + Chinese + Korean + Singaporean), giving the AI
    // a far richer pool to pick from. Direct sub-cuisine names (Korean, etc.)
    // also work — they fall through the fan-out and match by their own key.
    const selectedKeys = Array.from(new Set(
      (Array.isArray(cuisines) ? cuisines : [])
        .flatMap((c: string) => CUISINE_KEY_FANOUT[c] || [c])
        .filter((c: string) => CUISINE_DISHES[c]),
    ));
    const fallbackCuisine = defaultCuisineForCountry(country);
    const fallbackKeys = CUISINE_KEY_FANOUT[fallbackCuisine] || [fallbackCuisine];
    const cuisineKeys = selectedKeys.length ? selectedKeys : fallbackKeys;
    // FILTER the dish list to only include dishes the user can actually make.
    // A dish qualifies if EITHER:
    //   (a) its name explicitly mentions a fridge item ("Cabbage Stir Fry"
    //       qualifies when cabbage is in fridge), OR
    //   (b) it's a generic veg/protein dish that works with any combo
    //       ("Mixed Veg Sabzi", "Vegetable Pulao", "Khichdi", "Stir Fry").
    // Result: the AI literally can't pick "Aloo Methi" when there's no aloo
    // or methi — that dish isn't even in the candidate list.
    const fridgeNames = new Set(items.map((i: Item) => i.name.toLowerCase().trim()));
    // Include STAPLE_PANTRY in the available-token set so dishes that hero on
    // sooji/atta/dal/oats/pasta etc. qualify even when those aren't in the
    // fridge — most households keep them stocked in the dry pantry.
    const availableNames = new Set<string>([...fridgeNames, ...STAPLE_PANTRY]);
    const fridgeWordTokens = Array.from(availableNames).flatMap(n => n.split(/\s+/));
    // Generic dish patterns — these dishes work with WHATEVER veggies are in
    // the fridge (Mixed Veg X, Vegetable X). They can't fail a fridge match
    // because they're inherently flexible. CAUTION: only add patterns that
    // truly are flexible — "sabzi" alone is too loose because "Aloo Methi
    // Sabzi" specifically needs aloo + methi.
    const GENERIC_DISH_PATTERNS = [
      /^mixed veg/i,
      /^vegetable\b/i,
      /^veggie\b/i,
      /\bpulao$/i,
      /\bkhichdi$/i,
      /\bfried rice$/i,
      /\bstir[- ]fry$/i,
      /\bsoup$/i,
      /\bsalad$/i,
    ];
    // Specific hero ingredient words — if a dish name claims one of these, the
    // fridge MUST contain it (or an alias). This stops "Beef Stir-fry" /
    // "Tofu Stir-fry" from passing the generic stir-fry pattern when the user
    // doesn't actually have beef or tofu.
    const NAME_HEROES = [
      'tofu','chicken','beef','pork','mutton','lamb','fish','salmon','tuna','prawn','prawns','shrimp','egg','eggs','paneer',
      'rajma','chickpea','chickpeas','chana','dal','lentil','lentils',
      'bhindi','okra','methi','lauki','karela','spinach','palak','brinjal','eggplant','cabbage','carrot','capsicum','bell pepper','mushroom','tomato','potato','aloo','onion',
      'cauliflower','gobi','peas','matar','pumpkin','beans','corn','avocado','mango','banana','apple','strawberry','blueberry','berries',
    ];
    const NAME_HERO_ALIASES: Record<string, string[]> = {
      paneer: ['paneer','cottage cheese'],
      capsicum: ['capsicum','bell pepper','shimla mirch','peppers'],
      'bell pepper': ['capsicum','bell pepper'],
      brinjal: ['brinjal','eggplant','baingan','aubergine'],
      eggplant: ['brinjal','eggplant','baingan'],
      bhindi: ['bhindi','okra'],
      okra: ['bhindi','okra'],
      methi: ['methi','fenugreek'],
      lauki: ['lauki','bottle gourd','dudhi'],
      potato: ['potato','potatoes','aloo'],
      aloo: ['potato','potatoes','aloo'],
      spinach: ['spinach','palak'],
      palak: ['spinach','palak'],
      egg: ['egg','eggs','anda'],
      eggs: ['egg','eggs','anda'],
      prawn: ['prawn','prawns','shrimp'],
      fish: ['fish','salmon','tuna','machli'],
    };
    function fridgeHasHero(hero: string): boolean {
      const aliases = NAME_HERO_ALIASES[hero] || [hero];
      for (const a of aliases) {
        for (const tok of fridgeWordTokens) {
          if (tok === a || tok.includes(a) || a.includes(tok)) return true;
        }
      }
      return false;
    }
    function dishMatchesFridge(dish: string): boolean {
      const lc = dish.toLowerCase();
      // VETO STEP — if the dish name claims a specific hero, the fridge must
      // have it. This trumps any generic-pattern allowance below.
      const claimedHeroes = NAME_HEROES.filter(h => new RegExp(`\\b${h}\\b`, 'i').test(lc));
      if (claimedHeroes.length > 0) {
        return claimedHeroes.some(fridgeHasHero);
      }
      // No specific hero claimed — fall through to permissive checks.
      for (const tok of fridgeWordTokens) {
        if (tok.length >= 3 && lc.includes(tok)) return true;
      }
      for (const re of GENERIC_DISH_PATTERNS) {
        if (re.test(dish)) return true;
      }
      return false;
    }
    const fullCuratedList = Array.from(new Set(
      cuisineKeys.flatMap(c => CUISINE_DISHES[c]?.[slot] || []),
    ));
    const filteredCurated = fullCuratedList.filter(dishMatchesFridge);

    // Two real-recipe sources running IN PARALLEL — TheMealDB (free, no key,
    // ~300 curated) + Edamam (2.3M recipes with rich diet tags, free 10k/mo).
    // Both have 4–5s timeouts and fail silently. The AI then ranks the
    // combined pool. This is the "Supercook-style DB lookup + AI ranker"
    // approach — fast, hallucination-free, and dietarily precise.
    const dietaryFilterIds: string[] = Array.from(new Set(
      (Array.isArray(members) ? members : []).flatMap((m: Member) => m.dietaryFilters || []),
    ));
    let mealDBCandidates: string[] = [];
    let edamamCandidates: string[] = [];
    try {
      const [mdb, eda] = await Promise.all([
        fetchMealDBCandidates({
          ingredients: items.map((i: Item) => i.name),
          cuisines: cuisineKeys,
        }),
        fetchEdamamCandidates({
          ingredients: items.map((i: Item) => i.name),
          cuisines: cuisineKeys,
          slot,
          dietaryFilters: dietaryFilterIds,
        }),
      ]);
      mealDBCandidates = mdb.filter(dishMatchesFridge);
      edamamCandidates = eda.filter(dishMatchesFridge);
    } catch {
      // External recipe-source failures shouldn't break meal generation
    }

    // Combine: curated first (high confidence), then Edamam (rich + diet-aware),
    // then MealDB (variety). Cap at 18 — keeps the prompt focused.
    const combined = Array.from(new Set([
      ...filteredCurated,
      ...edamamCandidates,
      ...mealDBCandidates,
    ]));
    let dishList = combined;
    if (dishList.length < 3) dishList = fullCuratedList.slice(0, 8);
    dishList = dishList.slice(0, 18);

    const fridge = describeFridge(items);
    const member = describeMembers(members);
    const exclude = Array.isArray(excludeMeals) ? excludeMeals : [];

    const userPrompt = buildPrompt({
      slot, count: wantedCount, cuisineKeys, dishList, fridge, member, exclude,
    });
    const systemContent = `You are a home cooking assistant expert in ${cuisineKeys.join(', ')} cuisine. You only suggest dishes real families actually cook at home. Pick from the curated dish list provided — do not invent fusion. Return valid JSON only.`;

    let meals: V2Meal[] = [];
    let provider = '';
    let lastErr: string | undefined;

    if (OPENAI_KEY) {
      try {
        meals = await generateWithOpenAI(systemContent, userPrompt);
        provider = MEALS_MODEL;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : 'OpenAI failed';
      }
    }

    if (!meals.length && ANTHROPIC_KEY) {
      try {
        meals = await generateWithAnthropic(systemContent, userPrompt);
        provider = 'claude-sonnet-4-6';
      } catch (e) {
        lastErr = e instanceof Error ? e.message : 'Anthropic failed';
      }
    }

    if (!meals.length) {
      meals = makeFallbackMeals(items, slot, member.kidName);
      return NextResponse.json({ meals, provider: 'fallback', error: lastErr });
    }

    return NextResponse.json({ meals, provider });
  } catch (err) {
    return NextResponse.json({
      meals: [],
      error: err instanceof Error ? err.message : 'Meal generation failed',
    });
  }
}
