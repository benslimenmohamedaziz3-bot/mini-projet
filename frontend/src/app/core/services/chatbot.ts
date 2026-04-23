import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ArticleBrief,
  ChatHistoryTurn,
  ChatbotReply,
  ChatbotStatus
} from '../models/chatbot.model';
import { NewsArticle } from '../models/news.model';

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  // Angular service that talks to the backend chatbot routes.
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.backendApiBaseUrl;

  getArticleBrief(article: NewsArticle): Observable<ArticleBrief> {
    // Ask the backend for a short article summary.
    return this.http.post<ArticleBrief>(`${this.apiBaseUrl}/chatbot/article-brief`, {
      article: this.mapArticle(article)
    });
  }

  getStatus(): Observable<ChatbotStatus> {
    // Check whether Ollama and the selected model are ready.
    return this.http.get<ChatbotStatus>(`${this.apiBaseUrl}/chatbot/status`);
  }

  askChatbot(
    article: NewsArticle,
    message: string,
    history: ChatHistoryTurn[]
  ): Observable<ChatbotReply> {
    // Send the current message plus a small history to keep the conversation coherent.
    return this.http.post<ChatbotReply>(`${this.apiBaseUrl}/chatbot/ask`, {
      article: this.mapArticle(article),
      message,
      history
    });
  }

  private mapArticle(article: NewsArticle) {
    // Convert frontend field names to the backend format expected by FastAPI/Pydantic.
    return {
      article_id: article.id,
      title: article.title,
      description: article.description,
      content: article.content,
      image_url: article.imageUrl,
      source_url: article.url,
      source_name: article.sourceName,
      published_at: article.publishedAt,
      category: article.category
    };
  }
}
