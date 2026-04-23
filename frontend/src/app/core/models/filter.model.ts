import { NewsCategory } from './category.model';

export type NewsDataType =
  | 'news'
  | 'blog'
  | 'multimedia'
  | 'forum'
  | 'press_release'
  | 'review'
  | 'research'
  | 'opinion'
  | 'analysis'
  | 'podcast';

export interface SelectOption {
  label: string;
  value: string;
}

export interface NewsFilters {
  category: NewsCategory;
  country: string;
  source: string;
  date: string;
  dataType: NewsDataType | '';
}

export const COUNTRY_OPTIONS: SelectOption[] = [
  { label: 'All Countries', value: '' },
  { label: 'United States', value: 'us' },
  { label: 'Canada', value: 'ca' },
  { label: 'Mexico', value: 'mx' },
  { label: 'Brazil', value: 'br' },
  { label: 'Argentina', value: 'ar' },
  { label: 'Chile', value: 'cl' },
  { label: 'Colombia', value: 'co' },
  { label: 'Peru', value: 'pe' },
  { label: 'Venezuela', value: 've' },
  { label: 'United Kingdom', value: 'gb' },
  { label: 'Ireland', value: 'ie' },
  { label: 'France', value: 'fr' },
  { label: 'Germany', value: 'de' },
  { label: 'Italy', value: 'it' },
  { label: 'Spain', value: 'es' },
  { label: 'Portugal', value: 'pt' },
  { label: 'Netherlands', value: 'nl' },
  { label: 'Belgium', value: 'be' },
  { label: 'Switzerland', value: 'ch' },
  { label: 'Austria', value: 'at' },
  { label: 'Sweden', value: 'se' },
  { label: 'Norway', value: 'no' },
  { label: 'Denmark', value: 'dk' },
  { label: 'Finland', value: 'fi' },
  { label: 'Poland', value: 'pl' },
  { label: 'Czech Republic', value: 'cz' },
  { label: 'Hungary', value: 'hu' },
  { label: 'Romania', value: 'ro' },
  { label: 'Greece', value: 'gr' },
  { label: 'Turkey', value: 'tr' },
  { label: 'Ukraine', value: 'ua' },
  { label: 'Russia', value: 'ru' },
  { label: 'India', value: 'in' },
  { label: 'Pakistan', value: 'pk' },
  { label: 'Bangladesh', value: 'bd' },
  { label: 'Sri Lanka', value: 'lk' },
  { label: 'Nepal', value: 'np' },
  { label: 'China', value: 'cn' },
  { label: 'Japan', value: 'jp' },
  { label: 'South Korea', value: 'kr' },
  { label: 'North Korea', value: 'kp' },
  { label: 'Taiwan', value: 'tw' },
  { label: 'Hong Kong', value: 'hk' },
  { label: 'Singapore', value: 'sg' },
  { label: 'Malaysia', value: 'my' },
  { label: 'Indonesia', value: 'id' },
  { label: 'Thailand', value: 'th' },
  { label: 'Vietnam', value: 'vn' },
  { label: 'Philippines', value: 'ph' },
  { label: 'Australia', value: 'au' },
  { label: 'New Zealand', value: 'nz' },
  { label: 'South Africa', value: 'za' },
  { label: 'Nigeria', value: 'ng' },
  { label: 'Egypt', value: 'eg' },
  { label: 'Morocco', value: 'ma' },
  { label: 'Algeria', value: 'dz' },
  { label: 'Tunisia', value: 'tn' },
  { label: 'Kenya', value: 'ke' },
  { label: 'Ethiopia', value: 'et' },
  { label: 'Ghana', value: 'gh' },
  { label: 'Uganda', value: 'ug' },
  { label: 'Tanzania', value: 'tz' },
  { label: 'Zimbabwe', value: 'zw' },
  { label: 'Saudi Arabia', value: 'sa' },
  { label: 'United Arab Emirates', value: 'ae' },
  { label: 'Qatar', value: 'qa' },
  { label: 'Kuwait', value: 'kw' },
  { label: 'Bahrain', value: 'bh' },
  { label: 'Oman', value: 'om' },
  { label: 'Israel', value: 'il' },
  { label: 'Iran', value: 'ir' },
  { label: 'Iraq', value: 'iq' },
  { label: 'Jordan', value: 'jo' },
  { label: 'Lebanon', value: 'lb' },
  { label: 'Syria', value: 'sy' },
  { label: 'Afghanistan', value: 'af' },
  { label: 'Kazakhstan', value: 'kz' },
  { label: 'Uzbekistan', value: 'uz' },
  { label: 'Turkmenistan', value: 'tm' },
  { label: 'Kyrgyzstan', value: 'kg' },
  { label: 'Tajikistan', value: 'tj' },
  { label: 'Azerbaijan', value: 'az' },
  { label: 'Armenia', value: 'am' },
  { label: 'Georgia', value: 'ge' },
  { label: 'Belarus', value: 'by' },
  { label: 'Bulgaria', value: 'bg' },
  { label: 'Croatia', value: 'hr' },
  { label: 'Serbia', value: 'rs' },
  { label: 'Slovenia', value: 'si' },
  { label: 'Slovakia', value: 'sk' },
  { label: 'Lithuania', value: 'lt' },
  { label: 'Latvia', value: 'lv' },
  { label: 'Estonia', value: 'ee' },
  { label: 'Iceland', value: 'is' },
  { label: 'Luxembourg', value: 'lu' },
  { label: 'Malta', value: 'mt' },
  { label: 'Cyprus', value: 'cy' },
  { label: 'Uruguay', value: 'uy' },
  { label: 'Paraguay', value: 'py' },
  { label: 'Bolivia', value: 'bo' }
];

export const SOURCE_OPTIONS: SelectOption[] = [
  { label: 'All Sources', value: '' },
  { label: 'BBC', value: 'bbc.com' },
  { label: 'CNN', value: 'cnn.com' },
  { label: 'Reuters', value: 'reuters.com' },
  { label: 'The New York Times', value: 'nytimes.com' },
  { label: 'The Guardian', value: 'theguardian.com' },
  { label: 'Al Jazeera', value: 'aljazeera.com' },
  { label: 'Bloomberg', value: 'bloomberg.com' },
  { label: 'CNBC', value: 'cnbc.com' },
  { label: 'Forbes', value: 'forbes.com' },
  { label: 'TechCrunch', value: 'techcrunch.com' }
];

export const DATA_TYPE_OPTIONS: SelectOption[] = [
  { label: 'All Data Types', value: '' },
  { label: 'News', value: 'news' },
  { label: 'Blog', value: 'blog' },
  { label: 'Multimedia', value: 'multimedia' },
  { label: 'Forum', value: 'forum' },
  { label: 'Press Release', value: 'press_release' },
  { label: 'Review', value: 'review' },
  { label: 'Research', value: 'research' },
  { label: 'Opinion', value: 'opinion' },
  { label: 'Analysis', value: 'analysis' },
  { label: 'Podcast', value: 'podcast' }
];

export const DEFAULT_NEWS_FILTERS: NewsFilters = {
  category: 'all',
  country: '',
  source: '',
  date: '',
  dataType: ''
};
