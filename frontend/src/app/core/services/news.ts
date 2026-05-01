import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CATEGORY_OPTIONS, CategoryOption, NewsCategory } from '../models/category.model';
import {
  COUNTRY_OPTIONS,
  DATA_TYPE_OPTIONS,
  NewsDataType,
  NewsFilters,
  SelectOption
} from '../models/filter.model';
import {
  NewsApiArticle,
  NewsApiResponse,
  NewsArticle,
  NewsSection,
  NewsStore,
  PersonalizedNewsFeed
} from '../models/news.model';
import { PreferredNewsCategory } from '../models/user.model';

type RealCategory = Exclude<NewsCategory, 'all'>;

@Injectable({
  providedIn: 'root'
})
export class NewsService {
  private readonly http = inject(HttpClient);
  private readonly backendApiBaseUrl = `${environment.backendApiBaseUrl}/news-feed`;
  private readonly proxiedApiBaseUrl = '/api/1/news';
  private readonly directApiBaseUrl = 'https://newsdata.io/api/1/news';
  private readonly persistedCacheKey = 'newshub-news-store-v1';
  private readonly categoryFetchSize = 10;
  private readonly defaultCategoryDisplayCount = 5;
  private readonly preferredCategoryDisplayCount = 10;
  private readonly focusedCategoryDisplayCount = 12;
  private readonly categoryLabelMap = new Map(
    CATEGORY_OPTIONS.map((option) => [option.value, option.label] as const)
  );
  private readonly countryLabelMap = new Map(
    COUNTRY_OPTIONS.map((option) => [option.value, option.label] as const)
  );
  private readonly countryValueMap = new Map(
    COUNTRY_OPTIONS.flatMap((option) => [
      [this.normalizeOptionText(option.value), option.value] as const,
      [this.normalizeOptionText(option.label), option.value] as const
    ])
  );
  private readonly dataTypeLabelMap = new Map(
    DATA_TYPE_OPTIONS.map((option) => [option.value, option.label] as const)
  );

  private readonly categories: RealCategory[] = [
    'technology',
    'business',
    'politics',
    'science',
    'entertainment',
    'sports',
    'health'
  ];

  private newsStore$?: Observable<NewsStore>;

  getAllNews(): Observable<NewsStore> {
    if (!this.newsStore$) {
      this.newsStore$ = this.fetchNewsStore().pipe(
        tap((store) => this.persistStore(store)),
        catchError((error) => {
          console.error('News preload failed. Falling back to cached real articles.', error);
          this.newsStore$ = undefined;
          const cachedStore = this.readPersistedStore();

          if (this.hasAnyArticles(cachedStore)) {
            return of(cachedStore);
          }

          return throwError(() => error);
        }),
        shareReplay(1)
      );
    }

    return this.newsStore$;
  }

  getHomeFeed(
    filters: NewsFilters,
    preferredCategories: PreferredNewsCategory[] = []
  ): Observable<PersonalizedNewsFeed> {
    return this.getAllNews().pipe(
      map((store) => this.buildHomeFeedFromStore(store, filters, preferredCategories))
    );
  }

  getAvailableFilterOptions(
    filters: NewsFilters
  ): Observable<{
    categoryOptions: CategoryOption[];
    countryOptions: SelectOption[];
    sourceOptions: SelectOption[];
    dataTypeOptions: SelectOption[];
  }> {
    return this.getAllNews().pipe(map((store) => this.buildAvailableFilterOptions(store, filters)));
  }

  getArticleById(articleId: string, category?: RealCategory): Observable<NewsArticle | null> {
    if (category) {
      return this.getNewsByCategory(category).pipe(
        map((articles) => articles.find((article) => article.id === articleId) || null)
      );
    }

    return this.getAllNews().pipe(
      map((store) =>
        Object.values(store)
          .flat()
          .find((article) => article.id === articleId) || null
      )
    );
  }

  getNewsByCategory(category: RealCategory): Observable<NewsArticle[]> {
    return this.getAllNews().pipe(map((store) => store[category] ?? []));
  }

  private fetchNewsStore(): Observable<NewsStore> {
    const categoryRequests = this.categories.reduce(
      (requests, category) => {
        requests[category] = this.fetchCategoryArticles(category, this.categoryFetchSize).pipe(
          catchError((error) => {
            console.error(`Failed to load category "${category}" from NewsData.`, error);
            return of([]);
          })
        );
        return requests;
      },
      {} as Record<RealCategory, Observable<NewsArticle[]>>
    );

    return forkJoin(categoryRequests).pipe(
      map((store) => this.normalizeStore(store)),
      map((store) => {
        if (!this.hasAnyArticles(store)) {
          throw new Error('NewsData returned no usable category results.');
        }

        return store;
      })
    );
  }

  private fetchCategoryArticles(category: RealCategory, size: number): Observable<NewsArticle[]> {
    const params = new HttpParams()
      .set('apikey', environment.newsApiKey)
      .set('language', 'en')
      .set('category', category)
      .set('size', String(size));

    return this.requestNewsApi(params).pipe(
      map((response) => {
        if (response.status !== 'success') {
          throw new Error('News API returned a non-success status.');
        }

        return response;
      }),
      map((response) =>
        (response.results ?? []).map((item, index) => this.mapArticle(item, index))
      ),
      map((articles) => articles.map((article) => ({ ...article, category }))),
      map((articles) => articles.filter((article) => !!article.title)),
      map((articles) => this.sortByNewest(this.dedupeArticles(articles)))
    );
  }

  private requestNewsApi(params: HttpParams): Observable<NewsApiResponse> {
    const candidates = Array.from(
      new Set([
        environment.apiBaseUrl,
        this.backendApiBaseUrl,
        this.proxiedApiBaseUrl,
        this.directApiBaseUrl
      ])
    );

    return this.requestNewsApiFromCandidates(candidates, params);
  }

  private requestNewsApiFromCandidates(
    candidates: string[],
    params: HttpParams
  ): Observable<NewsApiResponse> {
    const [currentCandidate, ...remainingCandidates] = candidates;

    if (!currentCandidate) {
      return throwError(() => new Error('No news endpoints are available.'));
    }

    return this.http.get<NewsApiResponse>(currentCandidate, { params }).pipe(
      catchError((error) =>
        remainingCandidates.length > 0
          ? this.requestNewsApiFromCandidates(remainingCandidates, params)
          : throwError(() => error)
      )
    );
  }

  private buildHomeFeedFromStore(
    store: NewsStore,
    filters: NewsFilters,
    preferredCategories: PreferredNewsCategory[]
  ): PersonalizedNewsFeed {
    const resolvedPreferredCategories = this.normalizePreferredCategories(preferredCategories);

    if (filters.category !== 'all') {
      const focusedArticles = this.applyFilters(store[filters.category] ?? [], filters).slice(
        0,
        this.focusedCategoryDisplayCount
      );

      return {
        sections: [],
        articles: focusedArticles
      };
    }

    const orderedCategories = this.orderCategories(resolvedPreferredCategories);
    const preferredSet = new Set<RealCategory>(resolvedPreferredCategories);
    const sections: NewsSection[] = orderedCategories
      .map((category) => {
        const filteredArticles = this.applyFilters(store[category] ?? [], filters);
        const displayCount = preferredSet.has(category)
          ? this.preferredCategoryDisplayCount
          : this.defaultCategoryDisplayCount;

        return {
          category,
          preferred: preferredSet.has(category),
          availableCount: filteredArticles.length,
          articles: filteredArticles.slice(0, displayCount)
        };
      })
      .filter((section) => section.articles.length > 0);

    return {
      sections,
      articles: sections.flatMap((section) => section.articles)
    };
  }

  private buildAvailableFilterOptions(
    store: NewsStore,
    filters: NewsFilters
  ): {
    categoryOptions: CategoryOption[];
    countryOptions: SelectOption[];
    sourceOptions: SelectOption[];
    dataTypeOptions: SelectOption[];
  } {
    const allArticles = Object.values(store).flat();
    const scopedArticles = this.getScopedArticles(store, filters.category);
    const categoryArticles = this.applyFilters(allArticles, { ...filters, category: 'all' });
    const countryArticles = this.applyFilters(scopedArticles, { ...filters, country: '' });
    const sourceArticles = this.applyFilters(scopedArticles, { ...filters, source: '' });
    const dataTypeArticles = this.applyFilters(scopedArticles, { ...filters, dataType: '' });

    return {
      categoryOptions: this.ensureSelectedCategoryOption(
        this.buildCategoryOptions(categoryArticles),
        filters.category
      ),
      countryOptions: this.ensureSelectedSelectOption(
        this.buildCountryOptions(countryArticles),
        filters.country,
        this.getCountryLabel(this.getCountryValue(filters.country))
      ),
      sourceOptions: this.ensureSelectedSelectOption(
        this.buildSourceOptions(sourceArticles),
        filters.source,
        filters.source
      ),
      dataTypeOptions: this.ensureSelectedSelectOption(
        this.buildDataTypeOptions(dataTypeArticles),
        filters.dataType,
        filters.dataType ? this.getDataTypeLabel(filters.dataType) : ''
      )
    };
  }

  private applyFilters(articles: NewsArticle[], filters: NewsFilters): NewsArticle[] {
    return this.sortByNewest(
      articles.filter((article) => {
        if (filters.country && !this.matchesCountry(article, filters.country)) {
          return false;
        }

        if (filters.source && !this.matchesSource(article, filters.source)) {
          return false;
        }

        if (filters.date && this.toDateKey(article.publishedAt) !== filters.date) {
          return false;
        }

        if (filters.dataType && (article.dataType ?? 'news') !== filters.dataType) {
          return false;
        }

        return true;
      })
    );
  }

  private getScopedArticles(store: NewsStore, category: NewsCategory): NewsArticle[] {
    if (category === 'all') {
      return Object.values(store).flat();
    }

    return store[category] ?? [];
  }

  private buildCategoryOptions(articles: NewsArticle[]): CategoryOption[] {
    const categoryValues = Array.from(
      new Set(articles.map((article) => article.category))
    ).sort((left, right) => this.getCategoryLabel(left).localeCompare(this.getCategoryLabel(right)));

    return [
      { label: 'All', value: 'all' },
      ...categoryValues.map((category) => ({
        label: this.getCategoryLabel(category),
        value: category
      }))
    ];
  }

  private ensureSelectedCategoryOption(
    options: CategoryOption[],
    selectedCategory: NewsCategory
  ): CategoryOption[] {
    if (selectedCategory === 'all' || options.some((option) => option.value === selectedCategory)) {
      return options;
    }

    return [
      options[0],
      {
        label: this.getCategoryLabel(selectedCategory),
        value: selectedCategory
      },
      ...options.slice(1)
    ];
  }

  private buildCountryOptions(articles: NewsArticle[]): SelectOption[] {
    const countryValues = Array.from(
      new Set(
        articles
          .flatMap((article) => article.countries ?? [])
          .map((country) => this.getCountryValue(country))
          .filter(Boolean)
      )
    ).sort((left, right) => this.getCountryLabel(left).localeCompare(this.getCountryLabel(right)));

    return [
      { label: 'All Countries', value: '' },
      ...countryValues.map((country) => ({
        label: this.getCountryLabel(country),
        value: country
      }))
    ];
  }

  private ensureSelectedSelectOption(
    options: SelectOption[],
    selectedValue: string,
    selectedLabel: string
  ): SelectOption[] {
    if (!selectedValue || options.some((option) => option.value === selectedValue)) {
      return options;
    }

    return [
      options[0],
      {
        label: selectedLabel || selectedValue,
        value: selectedValue
      },
      ...options.slice(1)
    ];
  }

  private matchesCountry(article: NewsArticle, countryFilter: string): boolean {
    const normalizedFilter = this.getCountryValue(countryFilter);

    return (article.countries ?? []).some(
      (country) => this.getCountryValue(country) === normalizedFilter
    );
  }

  private buildSourceOptions(articles: NewsArticle[]): SelectOption[] {
    const sourceMap = new Map<string, string>();

    for (const article of articles) {
      const domain = this.normalizeDomain(article.sourceDomain || article.url || article.sourceName);
      if (!domain) {
        continue;
      }

      sourceMap.set(domain, sourceMap.get(domain) ?? article.sourceName?.trim() ?? domain);
    }

    const sourceOptions = Array.from(sourceMap.entries()).sort((left, right) =>
      left[1].localeCompare(right[1])
    );

    return [
      { label: 'All Sources', value: '' },
      ...sourceOptions.map(([value, label]) => ({ label, value }))
    ];
  }

  private buildDataTypeOptions(articles: NewsArticle[]): SelectOption[] {
    const dataTypeValues = Array.from(
      new Set(articles.map((article) => article.dataType ?? 'news'))
    ).sort((left, right) => this.getDataTypeLabel(left).localeCompare(this.getDataTypeLabel(right)));

    return [
      { label: 'All Data Types', value: '' },
      ...dataTypeValues.map((dataType) => ({
        label: this.getDataTypeLabel(dataType),
        value: dataType
      }))
    ];
  }

  private matchesSource(article: NewsArticle, sourceFilter: string): boolean {
    const normalizedFilter = this.normalizeDomain(sourceFilter);
    const articleDomain = article.sourceDomain
      ? this.normalizeDomain(article.sourceDomain)
      : this.normalizeDomain(article.url);

    return articleDomain.includes(normalizedFilter) || normalizedFilter.includes(articleDomain);
  }

  private orderCategories(preferredCategories: RealCategory[]): RealCategory[] {
    const preferredSet = new Set<RealCategory>(preferredCategories);
    const regularCategories = this.categories.filter((category) => !preferredSet.has(category));
    return [...preferredCategories, ...regularCategories];
  }

  private normalizePreferredCategories(
    preferredCategories: PreferredNewsCategory[]
  ): RealCategory[] {
    const validCategories = new Set<RealCategory>(this.categories);
    const normalized = preferredCategories
      .map((category) => category.toLowerCase() as RealCategory)
      .filter((category) => validCategories.has(category));

    return Array.from(new Set<RealCategory>(normalized)).slice(0, 3);
  }

  private mapArticle(item: NewsApiArticle, index: number): NewsArticle {
    const resolvedCategories = this.resolveSupportedCategories(item);
    const primaryCategory = resolvedCategories[0];
    const title = this.stripHtmlTags(item.title?.trim() || 'Untitled article');
    const rawDescription = this.stripHtmlTags(
      item.description?.trim() ||
        item.content?.trim() ||
        'No description available for this article.'
    );
    const content = this.resolveReadableContent(item.content, rawDescription);
    const id = item.article_id || `${primaryCategory}-${index}-${title}`;
    const publishedAt = item.pubDate || new Date().toISOString();
    const sourceDomain = this.normalizeDomain(item.link || item.source_name || item.source_id || '');
    const inferredDataType = this.inferDataType(item, content);

    return {
      id,
      title,
      description: this.truncateText(rawDescription, 160),
      content: this.stripHtmlTags(content),
      imageUrl: item.image_url || this.getFallbackImage(primaryCategory),
      sourceName: item.source_name || item.source_id || 'Unknown source',
      publishedAt,
      readTime: this.estimateReadTime(content || rawDescription || title),
      url: item.link || '#',
      category: primaryCategory,
      sourceDomain,
      countries: (item.country ?? []).map((country) => country.toLowerCase()),
      dataType: inferredDataType
    };
  }

  private resolveSupportedCategories(item: NewsApiArticle): RealCategory[] {
    const explicitCategories = (item.category ?? [])
      .map((category) => category.toLowerCase())
      .filter((category): category is RealCategory => this.categories.includes(category as RealCategory));

    if (explicitCategories.length > 0) {
      return Array.from(new Set(explicitCategories));
    }

    return [this.inferCategoryFromArticle(item)];
  }

  private inferDataType(item: NewsApiArticle, content: string): NewsDataType {
    const joinedText = [
      item.title ?? '',
      item.description ?? '',
      content,
      item.link ?? '',
      item.source_name ?? '',
      item.source_id ?? ''
    ]
      .join(' ')
      .toLowerCase();

    if (joinedText.includes('podcast')) {
      return 'podcast';
    }
    if (joinedText.includes('press release')) {
      return 'press_release';
    }
    if (joinedText.includes('review')) {
      return 'review';
    }
    if (joinedText.includes('research') || joinedText.includes('study')) {
      return 'research';
    }
    if (joinedText.includes('analysis')) {
      return 'analysis';
    }
    if (joinedText.includes('opinion')) {
      return 'opinion';
    }
    if (joinedText.includes('forum') || joinedText.includes('reddit')) {
      return 'forum';
    }
    if (joinedText.includes('video') || joinedText.includes('gallery')) {
      return 'multimedia';
    }
    if (
      joinedText.includes('blog') ||
      joinedText.includes('substack') ||
      joinedText.includes('medium.com')
    ) {
      return 'blog';
    }

    return 'news';
  }

  private inferCategoryFromArticle(item: NewsApiArticle): RealCategory {
    const haystack = [
      item.title ?? '',
      item.description ?? '',
      item.content ?? '',
      item.source_name ?? '',
      item.source_id ?? ''
    ]
      .join(' ')
      .toLowerCase();

    const categoryMatchers: Array<{ category: RealCategory; keywords: string[] }> = [
      {
        category: 'technology',
        keywords: ['technology', 'tech', 'ai', 'software', 'startup', 'cyber', 'device']
      },
      {
        category: 'business',
        keywords: ['business', 'market', 'finance', 'stocks', 'economy', 'trade', 'company']
      },
      {
        category: 'politics',
        keywords: ['politic', 'election', 'government', 'senate', 'minister', 'president']
      },
      {
        category: 'science',
        keywords: ['science', 'research', 'study', 'space', 'climate', 'physics', 'biology']
      },
      {
        category: 'entertainment',
        keywords: ['movie', 'music', 'celebrity', 'film', 'tv', 'show', 'entertainment']
      },
      {
        category: 'sports',
        keywords: ['sport', 'football', 'soccer', 'nba', 'match', 'tournament', 'player']
      },
      {
        category: 'health',
        keywords: ['health', 'medical', 'hospital', 'vaccine', 'doctor', 'wellness', 'disease']
      }
    ];

    const matchedCategory = categoryMatchers.find(({ keywords }) =>
      keywords.some((keyword) => haystack.includes(keyword))
    );

    return matchedCategory?.category ?? 'technology';
  }

  private resolveReadableContent(content: string | undefined, fallbackDescription: string): string {
    const safeContent = content?.trim();

    if (!safeContent) {
      return fallbackDescription;
    }

    const blockedPhrases = [
      'available only in paid plans',
      'available in paid plans',
      'only available in paid plans',
      'disponible uniquement dans les forfaits payants',
      'premium subscribers',
      'upgrade to premium',
      'subscribe to continue reading'
    ];

    const normalized = safeContent.toLowerCase();
    const hasBlockedPhrase = blockedPhrases.some((phrase) => normalized.includes(phrase));

    return hasBlockedPhrase ? fallbackDescription : safeContent;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength).trimEnd()}...`;
  }

  private stripHtmlTags(text: string): string {
    if (!text) {
      return '';
    }

    return text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
  }

  private dedupeArticles(articles: NewsArticle[]): NewsArticle[] {
    const uniqueMap = new Map<string, NewsArticle>();

    for (const article of articles) {
      const key = this.buildArticleKey(article);

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, article);
      }
    }

    return Array.from(uniqueMap.values());
  }

  private buildArticleKey(article: NewsArticle): string {
    const safeUrl = article.url && article.url !== '#' ? article.url.trim().toLowerCase() : '';
    const safeTitle = article.title.trim().toLowerCase();
    const safeSource = article.sourceName.trim().toLowerCase();

    return safeUrl || `${safeTitle}__${safeSource}`;
  }

  private sortByNewest(articles: NewsArticle[]): NewsArticle[] {
    return [...articles].sort(
      (left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
    );
  }

  private normalizeStore(store: NewsStore): NewsStore {
    return this.categories.reduce((normalizedStore, category) => {
      normalizedStore[category] = this.sortByNewest(this.dedupeArticles(store[category] ?? []));
      return normalizedStore;
    }, {} as NewsStore);
  }

  private hasAnyArticles(store: NewsStore): boolean {
    return this.categories.some((category) => (store[category] ?? []).length > 0);
  }

  private normalizeDomain(urlOrDomain: string): string {
    const safeValue = urlOrDomain.trim().toLowerCase();
    if (!safeValue) {
      return '';
    }

    const withProtocol = safeValue.startsWith('http') ? safeValue : `https://${safeValue}`;

    try {
      return new URL(withProtocol).hostname.replace(/^www\./, '');
    } catch {
      return safeValue.replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
    }
  }

  private getCategoryLabel(category: NewsCategory): string {
    return this.categoryLabelMap.get(category) ?? this.toCategoryLabel(category as RealCategory);
  }

  private getCountryLabel(countryCode: string): string {
    return this.countryLabelMap.get(countryCode) ?? countryCode.toUpperCase();
  }

  private getCountryValue(country: string): string {
    const normalizedCountry = this.normalizeOptionText(country);
    const aliases: Record<string, string> = {
      usa: 'us',
      'u s': 'us',
      'u s a': 'us',
      america: 'us',
      'united states of america': 'us',
      uk: 'gb',
      britain: 'gb',
      'great britain': 'gb'
    };

    return this.countryValueMap.get(normalizedCountry) ?? aliases[normalizedCountry] ?? normalizedCountry;
  }

  private getDataTypeLabel(dataType: NewsDataType): string {
    return this.dataTypeLabelMap.get(dataType) ?? dataType;
  }

  private normalizeOptionText(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private toDateKey(value: string): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  private estimateReadTime(text: string): number {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(3, Math.ceil(words / 200));
  }

  private persistStore(store: NewsStore): void {
    const storage = this.getStorage();
    if (!storage || !this.hasAnyArticles(store)) {
      return;
    }

    try {
      storage.setItem(this.persistedCacheKey, JSON.stringify(store));
    } catch {
      // Ignore storage quota and serialization failures.
    }
  }

  private readPersistedStore(): NewsStore {
    const storage = this.getStorage();
    if (!storage) {
      return this.createEmptyStore();
    }

    try {
      const rawValue = storage.getItem(this.persistedCacheKey);
      if (!rawValue) {
        return this.createEmptyStore();
      }

      const parsedValue = JSON.parse(rawValue);
      if (!parsedValue || typeof parsedValue !== 'object') {
        return this.createEmptyStore();
      }

      return this.categories.reduce((store, category) => {
        const categoryItems = Array.isArray(parsedValue[category]) ? parsedValue[category] : [];
        store[category] = categoryItems.filter((item): item is NewsArticle => {
          return (
            typeof item?.id === 'string' &&
            typeof item?.title === 'string' &&
            typeof item?.description === 'string' &&
            typeof item?.content === 'string' &&
            typeof item?.imageUrl === 'string' &&
            typeof item?.sourceName === 'string' &&
            typeof item?.publishedAt === 'string' &&
            typeof item?.readTime === 'number' &&
            typeof item?.url === 'string' &&
            this.categories.includes(item?.category)
          );
        });
        return store;
      }, this.createEmptyStore());
    } catch {
      return this.createEmptyStore();
    }
  }

  private getStorage(): Storage | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage;
  }

  private createEmptyStore(): NewsStore {
    return this.categories.reduce((store, category) => {
      store[category] = [];
      return store;
    }, {} as NewsStore);
  }

  private toCategoryLabel(category: RealCategory): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  private getFallbackImage(category: RealCategory): string {
    const label = this.toCategoryLabel(category);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0f172a" />
            <stop offset="100%" stop-color="#2563eb" />
          </linearGradient>
        </defs>
        <rect width="800" height="500" rx="36" fill="url(#bg)" />
        <circle cx="640" cy="110" r="88" fill="rgba(255,255,255,0.12)" />
        <circle cx="132" cy="390" r="118" fill="rgba(255,255,255,0.08)" />
        <text x="64" y="228" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="34" opacity="0.78">
          NewsHub
        </text>
        <text x="64" y="302" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="700">
          ${label}
        </text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }
}
