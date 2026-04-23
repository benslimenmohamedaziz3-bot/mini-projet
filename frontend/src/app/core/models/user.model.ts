export interface UserProfile {
  id: number;
  full_name: string;
  email: string;
  profile_photo?: string | null;
  interests: PreferredNewsCategory[];
}

export interface AuthResponse {
  message: string;
  access_token: string;
  token_type: string;
  user: UserProfile;
  user_id?: number;
}

export type PremiumPlan = 'monthly' | 'annual';

export interface PremiumMembership {
  isPremium: boolean;
  premiumPlan: PremiumPlan | null;
  premiumSince: string | null;
  paymentLast4?: string | null;
}

export interface UserSession extends UserProfile, PremiumMembership {}

export type PreferredNewsCategory =
  | 'technology'
  | 'business'
  | 'politics'
  | 'science'
  | 'entertainment'
  | 'sports'
  | 'health';

export interface UpdateProfileDetailsPayload {
  full_name: string;
  email: string;
  current_password?: string;
  new_password?: string;
}

export interface UpdateProfilePhotoPayload {
  profile_photo: string;
}

export interface UpdateProfileResponse {
  message: string;
  user: UserProfile;
  access_token?: string;
  token_type?: string;
}

export interface PremiumCheckoutPayload {
  plan: PremiumPlan;
  cardholderName: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
}
