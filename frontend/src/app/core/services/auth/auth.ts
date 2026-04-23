import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserProfile, UserSession } from '../../models/user.model';
import { PremiumService } from '../premium';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly premiumService = inject(PremiumService);
  private readonly userStorageKey = 'currentUser';
  private readonly tokenStorageKey = 'access_token';
  private currentUserSubject: BehaviorSubject<UserSession | null>;
  public currentUser$: Observable<UserSession | null>;

  constructor() {
    const storedUser = localStorage.getItem(this.userStorageKey);
    const storedToken = localStorage.getItem(this.tokenStorageKey);
    const hasUsableToken = storedToken ? !this.isTokenExpired(storedToken) : false;
    const parsedUser =
      storedUser && hasUsableToken ? (JSON.parse(storedUser) as UserProfile | UserSession) : null;

    if ((storedUser && !storedToken) || (!storedUser && storedToken) || (storedUser && storedToken && !hasUsableToken)) {
      localStorage.removeItem(this.userStorageKey);
      localStorage.removeItem(this.tokenStorageKey);
    }

    this.currentUserSubject = new BehaviorSubject<UserSession | null>(
      this.premiumService.decorateUser(parsedUser)
    );
    this.currentUser$ = this.currentUserSubject.asObservable();
  }

  public get currentUserValue(): UserSession | null {
    return this.currentUserSubject.value;
  }

  getToken(): string | null {
    const token = localStorage.getItem(this.tokenStorageKey);
    if (!token) {
      return null;
    }

    if (this.isTokenExpired(token)) {
      this.logout();
      return null;
    }

    return token;
  }

  setAuthData(user: UserProfile | UserSession | null, token?: string): void {
    const decoratedUser = this.premiumService.decorateUser(user);

    if (decoratedUser) {
      localStorage.setItem(this.userStorageKey, JSON.stringify(decoratedUser));
      if (token !== undefined) {
        if (token) {
          localStorage.setItem(this.tokenStorageKey, token);
        } else {
          localStorage.removeItem(this.tokenStorageKey);
        }
      }
    } else {
      localStorage.removeItem(this.userStorageKey);
      localStorage.removeItem(this.tokenStorageKey);
    }

    this.currentUserSubject.next(decoratedUser);
  }

  setCurrentUser(user: UserProfile | UserSession | null): void {
    this.setAuthData(user);
  }

  logout(): void {
    this.setAuthData(null);
  }

  private isTokenExpired(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length < 2) {
        return true;
      }

      const normalizedPayload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padding = (4 - (normalizedPayload.length % 4)) % 4;
      const paddedPayload = normalizedPayload + '='.repeat(padding);
      const parsedPayload = JSON.parse(atob(paddedPayload)) as { exp?: number };

      if (typeof parsedPayload.exp !== 'number') {
        return false;
      }

      return parsedPayload.exp * 1000 <= Date.now();
    } catch {
      return true;
    }
  }
}
