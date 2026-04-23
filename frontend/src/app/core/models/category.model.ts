export type NewsCategory =
  | 'all'
  | 'technology'
  | 'business'
  | 'politics'
  | 'science'
  | 'entertainment'
  | 'sports'
  | 'health';

export interface CategoryOption {
  label: string;
  value: NewsCategory;
}

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { label: 'All', value: 'all' },
  { label: 'Technology', value: 'technology' },
  { label: 'Business', value: 'business' },
  { label: 'Politics', value: 'politics' },
  { label: 'Science', value: 'science' },
  { label: 'Entertainment', value: 'entertainment' },
  { label: 'Sports', value: 'sports' },
  { label: 'Health', value: 'health' }
];