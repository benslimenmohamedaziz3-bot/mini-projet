import { Injectable } from '@angular/core';
import {
  PremiumMembership,
  PremiumPlan,
  UserProfile,
  UserSession
} from '../models/user.model';

interface PremiumRecord {
  premiumPlan: PremiumPlan;
  premiumSince: string;
  paymentLast4: string;
}

@Injectable({
  providedIn: 'root'
})
export class PremiumService {
  private readonly storageKey = 'newshub-premium-memberships';

  decorateUser(user: UserProfile | UserSession | null): UserSession | null {
    if (!user) {
      return null;
    }

    const membership = this.getMembership(user.id);

    return {
      ...user,
      interests: user.interests ?? [],
      isPremium: membership.isPremium,
      premiumPlan: membership.premiumPlan,
      premiumSince: membership.premiumSince,
      paymentLast4: membership.paymentLast4 ?? null
    };
  }

  getMembership(userId: number | null | undefined): PremiumMembership {
    if (!userId) {
      return {
        isPremium: false,
        premiumPlan: null,
        premiumSince: null,
        paymentLast4: null
      };
    }

    const records = this.readRecords();
    const record = records[String(userId)];

    if (!record) {
      return {
        isPremium: false,
        premiumPlan: null,
        premiumSince: null,
        paymentLast4: null
      };
    }

    return {
      isPremium: true,
      premiumPlan: record.premiumPlan,
      premiumSince: record.premiumSince,
      paymentLast4: record.paymentLast4
    };
  }

  activatePremium(user: UserProfile | UserSession, plan: PremiumPlan, cardNumber: string): UserSession {
    const records = this.readRecords();
    const trimmedNumber = cardNumber.replace(/\s+/g, '');
    const paymentLast4 = trimmedNumber.slice(-4) || '4242';

    records[String(user.id)] = {
      premiumPlan: plan,
      premiumSince: new Date().toISOString(),
      paymentLast4
    };

    this.writeRecords(records);
    return this.decorateUser(user)!;
  }

  private readRecords(): Record<string, PremiumRecord> {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? (JSON.parse(raw) as Record<string, PremiumRecord>) : {};
    } catch {
      return {};
    }
  }

  private writeRecords(records: Record<string, PremiumRecord>): void {
    localStorage.setItem(this.storageKey, JSON.stringify(records));
  }
}
