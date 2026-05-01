import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription, forkJoin } from 'rxjs';
import { CATEGORY_OPTIONS, CategoryOption } from '../../../core/models/category.model';
import {
  COUNTRY_OPTIONS,
  DATA_TYPE_OPTIONS,
  DEFAULT_NEWS_FILTERS,
  NewsFilters,
  SelectOption,
  SOURCE_OPTIONS
} from '../../../core/models/filter.model';
import { NewsArticle, NewsSection } from '../../../core/models/news.model';
import { PreferredNewsCategory } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth/auth';
import { NewsService } from '../../../core/services/news';
import { CategoryFilterComponent } from '../../../shared/components/category-filter/category-filter';
import { FooterComponent } from '../../../shared/components/footer/footer';
import { HeaderComponent } from '../../../shared/components/header/header';
import { HeroBannerComponent } from '../../../shared/components/hero-banner/hero-banner';
import { NewsCardComponent } from '../../../shared/components/news-card/news-card';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    HeroBannerComponent,
    CategoryFilterComponent,
    NewsCardComponent,
    FooterComponent
  ],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css'
})
export class HomePageComponent implements OnInit, OnDestroy {
  private readonly newsService = inject(NewsService);
  private readonly authService = inject(AuthService);
  private readonly rateLimitWindowMs = 15 * 60 * 1000;
  private readonly subscription = new Subscription();
  private rateLimitedUntil = 0;
  private loadRequestId = 0;
  private pendingLoadId: ReturnType<typeof setTimeout> | null = null;

  categories: CategoryOption[] = CATEGORY_OPTIONS;
  countryOptions: SelectOption[] = COUNTRY_OPTIONS;
  sourceOptions: SelectOption[] = SOURCE_OPTIONS;
  dataTypeOptions: SelectOption[] = DATA_TYPE_OPTIONS;

  preferredCategories: PreferredNewsCategory[] = [];
  filters: NewsFilters = { ...DEFAULT_NEWS_FILTERS };
  visibleArticles: NewsArticle[] = [];
  visibleSections: NewsSection[] = [];
  loading = true;
  error = '';

  ngOnInit(): void {
    this.subscription.add(
      this.authService.currentUser$.subscribe((user) => {
        this.preferredCategories = (user?.interests ?? []).slice(0, 3);
        this.loadNews();
      })
    );
  }

  ngOnDestroy(): void {
    if (this.pendingLoadId) {
      clearTimeout(this.pendingLoadId);
    }

    this.subscription.unsubscribe();
  }

  get showSectionedFeed(): boolean {
    return this.filters.category === 'all';
  }

  onFiltersChange(filters: NewsFilters): void {
    this.filters = { ...filters };

    if (this.pendingLoadId) {
      clearTimeout(this.pendingLoadId);
    }

    this.pendingLoadId = setTimeout(() => {
      this.pendingLoadId = null;
      this.loadNews();
    }, 180);
  }

  trackByArticle(_: number, article: NewsArticle): string {
    return article.id;
  }

  trackBySection(_: number, section: NewsSection): string {
    return section.category;
  }

  private loadNews(): void {
    const now = Date.now();

    if (this.rateLimitedUntil > now) {
      this.error = 'Rate limit reached. Please wait a few minutes and try again.';
      this.loading = false;
      return;
    }

    this.loading = true;
    this.error = '';
    const requestId = ++this.loadRequestId;
    const currentFilters = { ...this.filters };

    forkJoin({
      feed: this.newsService.getHomeFeed(currentFilters, this.preferredCategories),
      availableOptions: this.newsService.getAvailableFilterOptions(currentFilters)
    }).subscribe({
      next: ({ feed, availableOptions }) => {
        if (requestId !== this.loadRequestId) {
          return;
        }

        this.categories = availableOptions.categoryOptions;
        this.countryOptions = availableOptions.countryOptions;
        this.sourceOptions = availableOptions.sourceOptions;
        this.dataTypeOptions = availableOptions.dataTypeOptions;
        this.visibleSections = feed.sections;
        this.visibleArticles = feed.articles;
        this.loading = false;
      },
      error: (error: HttpErrorResponse) => {
        if (requestId !== this.loadRequestId) {
          return;
        }

        if (error.status === 429) {
          this.rateLimitedUntil = Date.now() + this.rateLimitWindowMs;
          this.error = 'Rate limit reached. Please wait a few minutes and try again.';
        } else {
          this.error = 'Unable to load news at the moment.';
        }
        this.visibleSections = [];
        this.visibleArticles = [];
        this.loading = false;
      }
    });
  }
}
