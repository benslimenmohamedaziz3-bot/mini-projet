import { DOCUMENT, CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UserSession } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth/auth';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class HeaderComponent implements OnInit {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly storageKey = 'f-news-theme';

  isDarkMode = false;
  currentUser: UserSession | null = null;
  showProfileDropdown = false;

  ngOnInit(): void {
    const storedTheme = localStorage.getItem(this.storageKey);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedTheme = storedTheme ?? (prefersDark ? 'dark' : 'light');

    this.isDarkMode = resolvedTheme === 'dark';
    this.applyTheme();

    this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
    });
  }

  get isPremiumUser(): boolean {
    return !!this.currentUser?.isPremium;
  }

  get initials(): string {
    if (!this.currentUser?.full_name) {
      return 'N';
    }

    return this.currentUser.full_name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  logout(): void {
    this.authService.logout();
    this.showProfileDropdown = false;
    this.router.navigate(['/']);
  }

  toggleProfileDropdown(): void {
    this.showProfileDropdown = !this.showProfileDropdown;
  }

  closeDropdown(): void {
    this.showProfileDropdown = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.profile-box-container')) {
      this.closeDropdown();
    }
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.applyTheme();
    localStorage.setItem(this.storageKey, this.isDarkMode ? 'dark' : 'light');
  }

  private applyTheme(): void {
    this.document.documentElement.setAttribute('data-theme', this.isDarkMode ? 'dark' : 'light');
  }
}
