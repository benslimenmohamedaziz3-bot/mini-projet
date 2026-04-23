import { Routes } from '@angular/router';
import { HomePageComponent } from './features/home/home-page/home-page';
import { NewsDetailsPageComponent } from './features/news/news-details-page/news-details-page';
import { AuthCard } from './shared/components/auth-card/auth-card';
import { ProfilePageComponent } from './features/profile/profile-page/profile-page';
import { PremiumPageComponent } from './features/premium/premium-page/premium-page';

export const appRoutes: Routes = [
  {
    path: '',
    component: HomePageComponent
  },
  {
    path: 'profile',
    component: ProfilePageComponent
  },
  {
    path: 'premium',
    component: PremiumPageComponent
  },
  {
    path: 'details/:id',
    component: NewsDetailsPageComponent
  },
  {
    path: 'login',
    component: AuthCard
  },
  {
    path: 'register',
    component: AuthCard
  },
  {
    path: '**',
    redirectTo: ''
  }

];
