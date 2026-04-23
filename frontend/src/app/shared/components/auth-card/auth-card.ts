import { Component, inject, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterForm } from '../register-form/register-form';
import { InterestsForm } from '../interests-form/interests-form';
import { LoginForm } from '../login-form/login-form';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth';
import { AuthResponse } from '../../../core/models/user.model';

interface SignupResponse extends AuthResponse {
  user_id: number;
}

@Component({
  selector: 'app-auth-card',
  standalone: true,
  imports: [CommonModule, RegisterForm, InterestsForm, LoginForm],
  templateUrl: './auth-card.html',
  styleUrls: ['./auth-card.css']
})
export class AuthCard implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);

  step = 1;
  mode: 'login' | 'signup' = 'login';
  registrationData: any = null;
  isLoading = false;
  errorMessage = '';
  returnUrl = '/';

  ngOnInit(): void {
    // Detect mode from route path
    const path = this.router.url;
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';

    if (path.includes('register')) {
      this.mode = 'signup';
    } else {
      this.mode = 'login';
    }
  }

  goToNextStep(data: any) {
    console.log("Registration data collected:", data);
    this.registrationData = data;
    this.step = 2;
    this.cdr.detectChanges();
  }

  finishSignup(interestIds: number[]) {
    if (!this.registrationData) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();
    
    const payload = {
      ...this.registrationData,
      interest_ids: interestIds
    };

    this.http.post<SignupResponse>('http://127.0.0.1:8000/complete-signup', payload).subscribe({
      next: (responseData) => {
        this.isLoading = false;
        console.log("Signup complete! Auto logging in...");
        this.authService.setAuthData(responseData.user, responseData.access_token);
        this.router.navigateByUrl(this.returnUrl);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.detail || 'An error occurred during signup. Please try again.';
        console.error("Error completing signup:", err);
        this.cdr.detectChanges();
      }
    });
  }

  onLoginSuccess(authResponse: AuthResponse) {
    this.authService.setAuthData(authResponse.user, authResponse.access_token);
    this.router.navigateByUrl(this.returnUrl);
  }

  switchToSignup() {
    this.router.navigate(['/register'], { queryParams: { returnUrl: this.returnUrl } });
    this.mode = 'signup';
    this.step = 1;
    this.errorMessage = '';
    this.cdr.detectChanges();
  }

  switchToLogin() {
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.returnUrl } });
    this.mode = 'login';
    this.step = 1;
    this.errorMessage = '';
    this.cdr.detectChanges();
  }
}
