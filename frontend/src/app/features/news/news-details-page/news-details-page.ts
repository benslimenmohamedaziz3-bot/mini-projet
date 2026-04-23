import { DatePipe, NgFor, NgIf, TitleCasePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NewsCategory } from '../../../core/models/category.model';
import { NewsArticle } from '../../../core/models/news.model';
import { UserSession } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth/auth';
import { CommentsService, NewsComment } from '../../../core/services/comments';
import { FavoritesService } from '../../../core/services/favorites';
import { NewsService } from '../../../core/services/news';
import { HeaderComponent } from '../../../shared/components/header/header';
import { FormsModule } from '@angular/forms';
import { ArticleAssistantPanelComponent } from '../article-assistant-panel/article-assistant-panel';

@Component({
  selector: 'app-news-details-page',
  standalone: true,
  imports: [
    ArticleAssistantPanelComponent,
    DatePipe,
    FormsModule,
    HeaderComponent,
    NgFor,
    NgIf,
    RouterLink,
    TitleCasePipe
  ],
  templateUrl: './news-details-page.html',
  styleUrl: './news-details-page.css'
})
export class NewsDetailsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly newsService = inject(NewsService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly commentsService = inject(CommentsService);
  private readonly authService = inject(AuthService);

  article: NewsArticle | null = null;
  currentUser: UserSession | null = null;
  loading = true;
  error = '';
  comments: NewsComment[] = [];
  commentText = '';
  commentError = '';
  loadingComments = false;
  submittingComment = false;
  saveError = '';
  isSaving = false;
  isSaved = false;
  loginReturnUrl = '';

  ngOnInit(): void {
    this.loginReturnUrl = this.router.url;
    this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
      this.loadSavedState();
    });

    const articleId = this.route.snapshot.paramMap.get('id');
    const categoryParam = this.route.snapshot.queryParamMap.get('category') as
      | Exclude<NewsCategory, 'all'>
      | null;
    const stateArticle = (window.history.state?.article as NewsArticle | undefined) ?? null;

    if (!articleId) {
      this.error = 'Article not found.';
      this.loading = false;
      return;
    }

    if (stateArticle && stateArticle.id === articleId) {
      this.article = stateArticle;
      this.loading = false;
      this.loadSavedState();
      this.loadComments();
      return;
    }

    this.newsService.getArticleById(articleId, categoryParam ?? undefined).subscribe({
      next: (article) => {
        this.article = article;
        this.error = article ? '' : 'Article not found.';
        this.loading = false;
        this.loadSavedState();
        this.loadComments();
      },
      error: () => {
        this.error = 'Unable to load article details right now.';
        this.loading = false;
      }
    });
  }

  toggleSaveArticle(): void {
    if (!this.article) {
      return;
    }

    const userId = this.getCurrentUserId();
    if (!userId) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.loginReturnUrl } });
      return;
    }

    if (!this.article.url || this.article.url === '#') {
      this.saveError = 'This article cannot be saved because the source URL is missing.';
      return;
    }

    this.saveError = '';
    this.isSaving = true;

    if (this.isSaved) {
      this.favoritesService.removeArticle(userId, this.article.url).subscribe({
        next: () => {
          this.isSaved = false;
          this.isSaving = false;
        },
        error: () => {
          this.saveError = 'Unable to remove the article right now.';
          this.isSaving = false;
        }
      });
      return;
    }

    this.favoritesService.saveArticle(userId, this.article).subscribe({
      next: () => {
        this.isSaved = true;
        this.isSaving = false;
      },
      error: () => {
        this.saveError = 'Unable to save the article right now.';
        this.isSaving = false;
      }
    });
  }

  submitComment(): void {
    if (!this.article) {
      return;
    }

    const userId = this.getCurrentUserId();
    if (!userId) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.loginReturnUrl } });
      return;
    }

    const cleanedComment = this.commentText.trim();
    if (!cleanedComment) {
      this.commentError = 'Write a comment before posting.';
      return;
    }

    this.commentError = '';
    this.submittingComment = true;

    this.commentsService.addComment(userId, this.article, cleanedComment).subscribe({
      next: () => {
        this.commentText = '';
        this.submittingComment = false;
        this.loadComments();
      },
      error: () => {
        this.commentError = 'Unable to post the comment right now.';
        this.submittingComment = false;
      }
    });
  }

  private getCurrentUserId(): number | null {
    return this.currentUser?.id ?? null;
  }

  private loadSavedState(): void {
    const userId = this.getCurrentUserId();
    if (!this.article || !userId || !this.article.url || this.article.url === '#') {
      this.isSaved = false;
      return;
    }

    this.favoritesService.isArticleSaved(userId, this.article.url).subscribe((saved) => {
      this.isSaved = saved;
    });
  }

  private loadComments(): void {
    if (!this.article || !this.article.url || this.article.url === '#') {
      this.comments = [];
      return;
    }

    this.loadingComments = true;
    this.commentsService.getComments(this.article.url).subscribe({
      next: (comments) => {
        this.comments = comments;
        this.loadingComments = false;
      },
      error: () => {
        this.comments = [];
        this.loadingComments = false;
      }
    });
  }

  isLoggedIn(): boolean {
    return !!this.currentUser;
  }

  isPremiumUser(): boolean {
    return !!this.currentUser?.isPremium;
  }

  scrollToAssistant(): void {
    if (!this.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.loginReturnUrl } });
      return;
    }

    if (!this.isPremiumUser()) {
      this.router.navigate(['/premium'], { queryParams: { returnUrl: this.loginReturnUrl } });
      return;
    }

    document.getElementById('article-assistant')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
}
