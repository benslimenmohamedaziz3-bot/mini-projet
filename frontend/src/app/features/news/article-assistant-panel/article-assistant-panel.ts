import { DatePipe, NgFor, NgIf } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ArticleBrief,
  AssistantMessage,
  ChatHistoryTurn,
  ChatbotReply,
  ChatbotStatus
} from '../../../core/models/chatbot.model';
import { NewsArticle } from '../../../core/models/news.model';
import { ChatbotService } from '../../../core/services/chatbot';

@Component({
  selector: 'app-article-assistant-panel',
  standalone: true,
  imports: [DatePipe, FormsModule, NgFor, NgIf],
  templateUrl: './article-assistant-panel.html',
  styleUrl: './article-assistant-panel.css'
})
export class ArticleAssistantPanelComponent implements OnChanges {
  @Input({ required: true }) article!: NewsArticle;

  // Service used to call the backend chatbot endpoints.
  private readonly chatbotService = inject(ChatbotService);

  // UI state used by the template.
  brief: ArticleBrief | null = null;
  status: ChatbotStatus | null = null;
  messages: AssistantMessage[] = [];
  draft = '';
  loading = false;
  loadingBrief = false;
  statusText = 'Checking AI...';
  error = '';

  // Ready-made prompts so beginners can try the chatbot quickly.
  readonly quickPrompts = [
    'Summarize this article.',
    'What are the key facts?',
    'Why is this important?',
    'Explain this simply.'
  ];

  ngOnChanges(changes: SimpleChanges): void {
    // Whenever the article changes, reset the panel and load fresh data for that article.
    if (!changes['article']?.currentValue) {
      return;
    }

    this.messages = [];
    this.draft = '';
    this.error = '';
    this.loadStatus();
    this.loadBrief();
  }

  send(prompt = this.draft): void {
    // Send either:
    // - the text typed in the textarea, or
    // - one of the quick prompt buttons.
    const content = prompt.trim();
    if (!content || this.loading) {
      return;
    }

    // Only a few previous messages are kept to make the request smaller and simpler.
    const history = this.history();

    if (prompt === this.draft) {
      this.draft = '';
    }

    this.error = '';
    this.messages = [...this.messages, this.createMessage('user', content, 'user')];

    // Show loading state while we wait for the backend answer.
    this.loading = true;
    this.chatbotService.askChatbot(this.article, content, history).subscribe({
      next: (reply) => {
        this.messages = [...this.messages, this.replyToMessage(reply)];
        this.loading = false;
      },
      error: () => {
        this.messages = [
          ...this.messages,
          this.createMessage(
            'assistant',
            "I couldn't answer right now. Please try again.",
            'general'
          )
        ];
        this.error = 'The chatbot is temporarily unavailable.';
        this.loading = false;
      }
    });
  }

  private loadStatus(): void {
    // Ask the backend whether Ollama + qwen3:14b are ready.
    this.statusText = 'Checking AI...';

    this.chatbotService.getStatus().subscribe({
      next: (status) => {
        this.status = status;
        this.statusText = status.generalReady
          ? `${status.activeGenerationModel || status.preferredGenerationModel} ready`
          : status.issues[0] || 'AI not ready';
      },
      error: () => {
        this.status = null;
        this.statusText = 'AI status unavailable';
      }
    });
  }

  private loadBrief(): void {
    // Ask the backend for a short article summary shown above the chat.
    this.loadingBrief = true;

    this.chatbotService.getArticleBrief(this.article).subscribe({
      next: (brief) => {
        this.brief = brief;
        this.loadingBrief = false;
      },
      error: () => {
        // Fallback summary if the backend summary endpoint fails.
        this.brief = {
          title: this.article.title,
          sourceName: this.article.sourceName,
          publishedAt: this.article.publishedAt,
          summary: this.article.description || this.article.content || this.article.title,
          longSummary: this.article.content || this.article.description || this.article.title,
          whyItMatters: 'This article highlights the main update and helps you understand it fast.',
          keyPoints: [this.article.description || this.article.title].filter(Boolean),
          people: [],
          organizations: [],
          places: [],
          dates: [],
          importantNumbers: [],
          timeline: [],
          suggestedQuestions: this.quickPrompts,
          limitations: [],
          blocked: false
        };
        this.loadingBrief = false;
      }
    });
  }

  private history(): ChatHistoryTurn[] {
    // Backend only needs a small history window, not the full conversation.
    return this.messages.slice(-4).map((message) => ({
      role: message.role,
      content: message.content,
      mode: message.mode === 'grounded' ? 'grounded' : 'general'
    }));
  }

  private replyToMessage(reply: ChatbotReply): AssistantMessage {
    // Convert the backend reply shape into the frontend message shape.
    return {
      id: this.id(),
      role: 'assistant',
      content: reply.answer,
      mode: reply.mode,
      limitations: reply.limitations,
      createdAt: new Date().toISOString()
    };
  }

  private createMessage(
    role: 'user' | 'assistant',
    content: string,
    mode: 'user' | 'grounded' | 'general'
  ): AssistantMessage {
    // Helper for building one local chat message object.
    return {
      id: this.id(),
      role,
      content,
      mode,
      createdAt: new Date().toISOString()
    };
  }

  private id(): string {
    // Small unique id so Angular can track rendered messages.
    return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }
}
