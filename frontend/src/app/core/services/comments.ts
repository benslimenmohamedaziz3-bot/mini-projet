import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { NewsArticle } from '../models/news.model';

export interface NewsComment {
  comment_id: number;
  comment_content: string;
  createdAt: string | null;
  user_id: number;
  full_name: string;
}

interface AddCommentResponse {
  message: string;
  comment_id: number;
  news_id: number;
}

@Injectable({
  providedIn: 'root'
})
export class CommentsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = 'http://127.0.0.1:8000';

  getComments(articleUrl: string): Observable<NewsComment[]> {
    const params = new HttpParams().set('article_url', articleUrl);
    return this.http.get<NewsComment[]>(`${this.apiBaseUrl}/comments`, { params });
  }

  addComment(userId: number, article: NewsArticle, commentText: string): Observable<AddCommentResponse> {
    return this.http.post<AddCommentResponse>(`${this.apiBaseUrl}/comments`, {
      user_id: userId,
      article: {
        article_id: article.id,
        title: article.title,
        description: article.description,
        content: article.content,
        image_url: article.imageUrl,
        source_url: article.url,
        source_name: article.sourceName,
        published_at: article.publishedAt,
        category: article.category
      },
      comment_text: commentText
    });
  }
}
