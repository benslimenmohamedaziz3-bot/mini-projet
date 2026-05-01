import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  PremiumCheckoutPayload,
  PremiumPlan,
  UserProfile,
  UserRole,
  UserSession
} from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class PremiumService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = `${environment.backendApiBaseUrl}/premium`;

  decorateUser(user: UserProfile | UserSession | null): UserSession | null {
    if (!user) {
      return null;
    }

    const premiumPlan = (user as UserProfile & { premiumPlan?: PremiumPlan | null }).premiumPlan
      ?? user.premium_plan
      ?? null;
    const premiumSince = (user as UserProfile & { premiumSince?: string | null }).premiumSince
      ?? user.premium_since
      ?? null;
    const isPremium = (user as UserProfile & { isPremium?: boolean }).isPremium
      ?? user.is_premium
      ?? false;
    const role = user.role ?? ('user' satisfies UserRole);

    return {
      ...user,
      interests: user.interests ?? [],
      role,
      isPremium,
      premiumPlan,
      premiumSince
    };
  }

  activatePremium(payload: PremiumCheckoutPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/activate`, payload);
  }
}
