export type RecipeId = 'ramen' | 'lentil' | 'shakshuka'

export interface Ingredient {
  amt: string
  name: string
}

export interface Recipe {
  id: RecipeId
  name: string
  blurb: string
  time: string
  kcal: string
  protein: string
  carbs: string
  fat: string
  ingCount: string
  servings: string
  gradient: string
  tags: string[]
  dietLine: string
  macroTags: string[]
  ingredients: Ingredient[]
}

export const RECIPES: Record<RecipeId, Recipe> = {
  ramen: {
    id: 'ramen',
    name: 'Miso ramen',
    blurb: 'A warming vegetarian broth with deep umami flavour, soft-boiled egg, chewy noodles, and seasonal vegetables.',
    time: '25 min',
    kcal: '420',
    protein: '18g',
    carbs: '52g',
    fat: '12g',
    ingCount: '9 ingredients',
    servings: '2 servings',
    gradient: 'radial-gradient(circle at 50% 38%, #f0a35a, #c9512b 80%)',
    tags: ['warm', 'umami', 'filling'],
    dietLine: '25 min · 420 kcal · vegetarian',
    macroTags: ['18g protein', '52g carbs', '12g fat'],
    ingredients: [
      { amt: '4 cups', name: 'dashi or vegetable stock' },
      { amt: '3 tbsp', name: 'white miso paste' },
      { amt: '150g', name: 'ramen noodles' },
      { amt: '2', name: 'soft-boiled eggs' },
      { amt: '1 cup', name: 'shiitake mushrooms, sliced' },
      { amt: '2', name: 'spring onions' },
      { amt: '1 sheet', name: 'nori' },
      { amt: '1 tbsp', name: 'sesame oil' },
      { amt: '1 tsp', name: 'chili crisp' },
    ],
  },
  lentil: {
    id: 'lentil',
    name: 'Lentil soup',
    blurb: 'Hearty red lentils simmered with cumin, tomato, and a bright squeeze of lemon — vegan and protein-rich.',
    time: '30 min',
    kcal: '340',
    protein: '22g',
    carbs: '48g',
    fat: '4g',
    ingCount: '7 ingredients',
    servings: '4 servings',
    gradient: 'radial-gradient(circle at 50% 38%, #e8b65a, #b06a2a 80%)',
    tags: ['hearty', 'protein'],
    dietLine: '30 min · 340 kcal · vegan',
    macroTags: ['22g protein', '48g carbs', '4g fat'],
    ingredients: [
      { amt: '1.5 cups', name: 'red lentils, rinsed' },
      { amt: '1', name: 'onion, diced' },
      { amt: '2 tsp', name: 'ground cumin' },
      { amt: '1 can', name: 'chopped tomatoes' },
      { amt: '4 cups', name: 'vegetable stock' },
      { amt: '1', name: 'lemon, juiced' },
      { amt: '2 tbsp', name: 'olive oil' },
    ],
  },
  shakshuka: {
    id: 'shakshuka',
    name: 'Shakshuka',
    blurb: 'Eggs gently poached in a spiced tomato and pepper sauce — fast, vegetarian, and full of flavour.',
    time: '20 min',
    kcal: '310',
    protein: '16g',
    carbs: '22g',
    fat: '18g',
    ingCount: '8 ingredients',
    servings: '2 servings',
    gradient: 'radial-gradient(circle at 50% 38%, #ef7e63, #b3372a 80%)',
    tags: ['spiced', 'eggs'],
    dietLine: '20 min · 310 kcal · vegetarian',
    macroTags: ['16g protein', '22g carbs', '18g fat'],
    ingredients: [
      { amt: '4', name: 'eggs' },
      { amt: '1 can', name: 'chopped tomatoes' },
      { amt: '1', name: 'red pepper, sliced' },
      { amt: '1', name: 'onion, diced' },
      { amt: '2 cloves', name: 'garlic, minced' },
      { amt: '1 tsp', name: 'smoked paprika' },
      { amt: '1/2 tsp', name: 'cumin' },
      { amt: '2 tbsp', name: 'olive oil' },
    ],
  },
}
