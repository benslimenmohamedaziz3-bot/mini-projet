import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserSession } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth/auth';

@Component({
  selector: 'app-hero-banner',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './hero-banner.html',
  styleUrl: './hero-banner.css'
})
export class HeroBannerComponent implements OnInit {
  private readonly authService = inject(AuthService);
  currentUser: UserSession | null = null;

  ngOnInit(): void {
    this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
    });
  }

  get isPremiumUser(): boolean {
    return !!this.currentUser?.isPremium;
  }
}
