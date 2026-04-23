import { DatePipe, NgIf, TitleCasePipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NewsArticle } from '../../../core/models/news.model';

@Component({
  selector: 'app-news-card',
  standalone: true,
  imports: [DatePipe, NgIf, RouterLink, TitleCasePipe],
  templateUrl: './news-card.html',
  styleUrl: './news-card.css'
})
export class NewsCardComponent {
  @Input({ required: true }) article!: NewsArticle;

  imageError = false;

  onImageError(): void {
    this.imageError = true;
  }
}