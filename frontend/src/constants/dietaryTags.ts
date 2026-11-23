import type { IconName } from '../components/ui/Icon';

export const DIETARY_TAGS = [
  { id: 'vegan', label: 'Vegan', icon: 'leaf' as IconName },
  { id: 'vegetarian', label: 'Vegetarian', icon: 'nutrition' as IconName },
  { id: 'halal', label: 'Halal', icon: 'mosque' as IconName },
  { id: 'kosher', label: 'Kosher', icon: 'synagogue' as IconName },
  { id: 'gluten_free', label: 'Gluten-Free', icon: 'grain' as IconName },
  { id: 'nut_free', label: 'Nut-Free', icon: 'noFood' as IconName },
  { id: 'dairy_free', label: 'Dairy-Free', icon: 'drink' as IconName },
  { id: 'shellfish_free', label: 'Shellfish-Free', icon: 'seafood' as IconName },
  { id: 'egg_free', label: 'Egg-Free', icon: 'egg' as IconName },
  { id: 'soy_free', label: 'Soy-Free', icon: 'grass' as IconName },
  { id: 'low_sodium', label: 'Low Sodium', icon: 'salt' as IconName },
  { id: 'diabetic_friendly', label: 'Diabetic-Friendly', icon: 'vaccine' as IconName },
] as const;

export type DietaryTagId = typeof DIETARY_TAGS[number]['id'];
