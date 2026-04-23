import { CommonModule, DatePipe, NgClass, TitleCasePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { delay, finalize, of } from 'rxjs';
import {
  PremiumCheckoutPayload,
  PremiumPlan,
  UserSession
} from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth/auth';
import { PremiumService } from '../../../core/services/premium';
import { FooterComponent } from '../../../shared/components/footer/footer';
import { HeaderComponent } from '../../../shared/components/header/header';

interface PlanCard {
  id: PremiumPlan;
  name: string;
  price: string;
  billing: string;
  highlight: string;
  features: string[];
}

@Component({
  selector: 'app-premium-page',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FooterComponent,
    HeaderComponent,
    NgClass,
    ReactiveFormsModule,
    RouterLink,
    TitleCasePipe
  ],
  templateUrl: './premium-page.html',
  styleUrl: './premium-page.css'
})
export class PremiumPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly premiumService = inject(PremiumService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  currentUser: UserSession | null = null;
  returnUrl = '/profile';
  isProcessing = false;
  successMessage = '';
  errorMessage = '';
  simulatedReceipt = '';

  readonly plans: PlanCard[] = [
    {
      id: 'monthly',
      name: 'Premium Monthly',
      price: '9.99 EUR',
      billing: 'per month',
      highlight: 'Best to unlock the chatbot quickly',
      features: [
        'Unlimited article assistant access',
        'Grounded summaries and follow-up questions',
        'Premium badge in your NewsHub account'
      ]
    },
    {
      id: 'annual',
      name: 'Premium Annual',
      price: '89.00 EUR',
      billing: 'per year',
      highlight: 'Best value for regular readers',
      features: [
        'Everything in monthly access',
        'Priority premium experience across the app',
        'Simulated savings compared with monthly billing'
      ]
    }
  ];

  readonly checkoutForm = this.formBuilder.nonNullable.group({
    plan: ['annual' as PremiumPlan, [Validators.required]],
    cardholderName: ['', [Validators.required, Validators.minLength(3)]],
    cardNumber: ['', [Validators.required, Validators.minLength(16)]],
    expiry: ['', [Validators.required, Validators.minLength(5)]],
    cvc: ['', [Validators.required, Validators.minLength(3)]],
    acceptTerms: [false, [Validators.requiredTrue]]
  });

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/profile';

    this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
    });
  }

  get selectedPlan(): PlanCard {
    return (
      this.plans.find((plan) => plan.id === this.checkoutForm.controls.plan.value) ?? this.plans[0]
    );
  }

  get isPremiumUser(): boolean {
    return !!this.currentUser?.isPremium;
  }

  selectPlan(plan: PremiumPlan): void {
    this.checkoutForm.controls.plan.setValue(plan);
  }

  simulateCheckout(): void {
    if (!this.currentUser) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/premium' } });
      return;
    }

    this.successMessage = '';
    this.errorMessage = '';

    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      return;
    }

    this.isProcessing = true;

    const payload = this.checkoutForm.getRawValue() as PremiumCheckoutPayload & { acceptTerms: boolean };

    of(payload)
      .pipe(
        delay(1200),
        finalize(() => {
          this.isProcessing = false;
        })
      )
      .subscribe({
        next: (formValue) => {
          const upgradedUser = this.premiumService.activatePremium(
            this.currentUser!,
            formValue.plan,
            formValue.cardNumber
          );

          this.authService.setCurrentUser(upgradedUser);
          this.simulatedReceipt = this.buildReceiptReference(upgradedUser.id);
          this.successMessage =
            'Premium access has been activated in simulation mode. No real payment was processed.';
        },
        error: () => {
          this.errorMessage = 'The premium simulation could not be completed. Please try again.';
        }
      });
  }

  continueAfterUpgrade(): void {
    this.router.navigateByUrl(this.returnUrl);
  }

  private buildReceiptReference(userId: number): string {
    const timestamp = Date.now().toString().slice(-6);
    return `SIM-${userId}-${timestamp}`;
  }
}
