import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { NewsArticle } from '../../../core/models/news.model';
import {
  UpdateProfileDetailsPayload,
  UpdateProfilePhotoPayload,
  UpdateProfileResponse,
  UserSession
} from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth/auth';
import { FavoritesService } from '../../../core/services/favorites';
import { ProfileService } from '../../../core/services/profile';
import { FooterComponent } from '../../../shared/components/footer/footer';
import { HeaderComponent } from '../../../shared/components/header/header';
import { NewsCardComponent } from '../../../shared/components/news-card/news-card';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, NewsCardComponent, HeaderComponent, FooterComponent],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css'
})
export class ProfilePageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly favoritesService = inject(FavoritesService);
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);

  currentUser: UserSession | null = null;
  savedArticles: NewsArticle[] = [];
  isLoadingProfile = true;
  isLoadingFavorites = true;
  isSavingDetails = false;
  isSavingPhoto = false;
  loadError = '';
  detailsError = '';
  detailsSuccessMessage = '';
  photoError = '';
  photoActionError = '';
  photoActionSuccessMessage = '';
  selectedProfilePhoto: string | null = null;

  readonly profileForm = this.formBuilder.nonNullable.group(
    {
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      currentPassword: [''],
      newPassword: ['', [Validators.minLength(8)]],
      confirmPassword: ['']
    },
    { validators: [ProfilePageComponent.passwordValidator] }
  );

  ngOnInit(): void {
    const authenticatedUser = this.authService.currentUserValue as UserSession | null;

    if (!authenticatedUser?.id) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/profile' } });
      return;
    }

    this.currentUser = authenticatedUser;
    this.patchForm(authenticatedUser);
    this.loadProfile(authenticatedUser.id);
    this.loadFavorites(authenticatedUser.id);
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

  get savedArticlesCount(): number {
    return this.savedArticles.length;
  }

  get isPremiumUser(): boolean {
    return !!this.currentUser?.isPremium;
  }

  get premiumPlanLabel(): string {
    return this.currentUser?.premiumPlan ? this.currentUser.premiumPlan : 'free';
  }

  get profileCompletion(): number {
    const values = this.profileForm.getRawValue();
    const completedFields = [values.firstName, values.lastName, values.email, this.selectedProfilePhoto ?? ''].filter(
      (value) => value.trim().length > 0
    ).length;

    return Math.round((completedFields / 4) * 100);
  }

  get isProfileFormBusy(): boolean {
    return this.isLoadingProfile || this.isSavingDetails;
  }

  get isPhotoBusy(): boolean {
    return this.isLoadingProfile || this.isSavingPhoto;
  }

  get profilePhotoPreview(): string | null {
    return this.selectedProfilePhoto;
  }

  get savedProfilePhoto(): string | null {
    return this.currentUser?.profile_photo ?? null;
  }

  get hasPendingPhotoSelection(): boolean {
    return this.profilePhotoPreview !== this.savedProfilePhoto;
  }

  get canSavePhoto(): boolean {
    return !!this.profilePhotoPreview && this.hasPendingPhotoSelection;
  }

  get canRemovePhoto(): boolean {
    return !!this.savedProfilePhoto && !this.hasPendingPhotoSelection;
  }

  get profileStatusLabel(): string {
    if (this.isLoadingProfile) {
      return 'Loading';
    }

    if (this.isSavingPhoto) {
      return 'Saving photo';
    }

    if (this.isSavingDetails) {
      return 'Saving details';
    }

    return 'Ready';
  }

  get firstNameControl(): AbstractControl<string, string> {
    return this.profileForm.controls.firstName;
  }

  get lastNameControl(): AbstractControl<string, string> {
    return this.profileForm.controls.lastName;
  }

  get emailControl(): AbstractControl<string, string> {
    return this.profileForm.controls.email;
  }

  get currentPasswordControl(): AbstractControl<string, string> {
    return this.profileForm.controls.currentPassword;
  }

  get newPasswordControl(): AbstractControl<string, string> {
    return this.profileForm.controls.newPassword;
  }

  get confirmPasswordControl(): AbstractControl<string, string> {
    return this.profileForm.controls.confirmPassword;
  }

  loadFavorites(userId: number): void {
    this.isLoadingFavorites = true;

    this.favoritesService
      .getFavorites(userId)
      .pipe(finalize(() => (this.isLoadingFavorites = false)))
      .subscribe({
        next: (articles) => {
          this.savedArticles = articles;
        },
        error: (error) => {
          console.error('Failed to load favorites', error);
        }
      });
  }

  saveProfile(): void {
    if (!this.currentUser?.id) {
      return;
    }

    this.detailsSuccessMessage = '';
    this.detailsError = '';

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const formValue = this.profileForm.getRawValue();
    const fullName = `${formValue.firstName} ${formValue.lastName}`.replace(/\s+/g, ' ').trim();
    const payload: UpdateProfileDetailsPayload = {
      full_name: fullName,
      email: formValue.email.trim().toLowerCase(),
      current_password: formValue.currentPassword.trim() || undefined,
      new_password: formValue.newPassword.trim() || undefined
    };

    this.isSavingDetails = true;

    this.profileService
      .updateProfileDetails(this.currentUser.id, payload)
      .pipe(finalize(() => (this.isSavingDetails = false)))
      .subscribe({
        next: (response) => {
          this.syncCurrentUser(response);
          if (this.currentUser) {
            this.patchForm(this.currentUser);
          }
          this.detailsSuccessMessage = 'Your profile details have been updated successfully.';
        },
        error: (error) => {
          this.detailsError = this.resolveRequestError(
            error,
            'Unable to update your profile right now. Please try again.'
          );
        }
      });
  }

  resetForm(): void {
    if (!this.currentUser) {
      return;
    }

    this.detailsError = '';
    this.detailsSuccessMessage = '';
    this.photoError = '';
    this.photoActionError = '';
    this.photoActionSuccessMessage = '';
    this.patchForm(this.currentUser);
  }

  async onProfilePhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.photoError = 'Please choose a valid image file.';
      this.photoActionError = '';
      this.photoActionSuccessMessage = '';
      input.value = '';
      return;
    }

    if (file.size > 1_500_000) {
      this.photoError = 'Please choose an image smaller than 1.5 MB.';
      this.photoActionError = '';
      this.photoActionSuccessMessage = '';
      input.value = '';
      return;
    }

    try {
      this.selectedProfilePhoto = await this.readProfilePhoto(file);
      this.photoError = '';
      this.photoActionError = '';
      this.photoActionSuccessMessage = '';
    } catch {
      this.photoError = 'The selected image could not be processed.';
    } finally {
      input.value = '';
    }
  }

  cancelPhotoSelection(): void {
    this.selectedProfilePhoto = this.savedProfilePhoto;
    this.photoError = '';
    this.photoActionError = '';
    this.photoActionSuccessMessage = '';
  }

  saveProfilePhoto(): void {
    if (!this.currentUser?.id || !this.selectedProfilePhoto) {
      return;
    }

    const payload: UpdateProfilePhotoPayload = {
      profile_photo: this.selectedProfilePhoto
    };

    this.photoError = '';
    this.photoActionError = '';
    this.photoActionSuccessMessage = '';
    this.isSavingPhoto = true;

    this.profileService
      .updateProfilePhoto(this.currentUser.id, payload)
      .pipe(finalize(() => (this.isSavingPhoto = false)))
      .subscribe({
        next: (response) => {
          this.syncCurrentUser(response);
          this.selectedProfilePhoto = this.savedProfilePhoto;
          this.photoActionSuccessMessage = 'Your profile photo has been updated successfully.';
        },
        error: (error) => {
          this.photoActionError = this.resolveRequestError(
            error,
            'Unable to update your photo right now. Please try again.'
          );
        }
      });
  }

  removeProfilePhoto(): void {
    if (!this.currentUser?.id || !this.savedProfilePhoto) {
      return;
    }

    this.photoError = '';
    this.photoActionError = '';
    this.photoActionSuccessMessage = '';
    this.isSavingPhoto = true;

    this.profileService
      .removeProfilePhoto(this.currentUser.id)
      .pipe(finalize(() => (this.isSavingPhoto = false)))
      .subscribe({
        next: (response) => {
          this.syncCurrentUser(response);
          this.selectedProfilePhoto = null;
          this.photoActionSuccessMessage = 'Your profile photo has been removed successfully.';
        },
        error: (error) => {
          this.photoActionError = this.resolveRequestError(
            error,
            'Unable to remove your photo right now. Please try again.'
          );
        }
      });
  }

  trackByArticle(_: number, article: NewsArticle): string {
    return article.url;
  }

  private loadProfile(userId: number): void {
    this.isLoadingProfile = true;
    this.loadError = '';

    this.profileService
      .getProfile(userId)
      .pipe(finalize(() => (this.isLoadingProfile = false)))
      .subscribe({
        next: (user) => {
          this.authService.setCurrentUser(user);
          this.currentUser = this.authService.currentUserValue;
          if (this.currentUser) {
            this.patchForm(this.currentUser);
          }
        },
        error: (error) => {
          this.loadError = this.resolveRequestError(
            error,
            'The latest profile data could not be loaded from the server. You can still edit the local session data.'
          );
        }
      });
  }

  private patchForm(user: UserSession): void {
    const [firstName, ...lastNameParts] = user.full_name.trim().split(/\s+/);
    this.selectedProfilePhoto = user.profile_photo ?? null;

    this.profileForm.reset(
      {
        firstName: firstName ?? '',
        lastName: lastNameParts.join(' '),
        email: user.email ?? '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      },
      { emitEvent: false }
    );
  }

  private syncCurrentUser(response: UpdateProfileResponse): void {
    this.authService.setAuthData(response.user, response.access_token);
    this.currentUser = this.authService.currentUserValue;
  }

  private resolveRequestError(error: { status?: number; error?: { detail?: string } | string }, fallback: string): string {
    if (typeof error?.error === 'string' && error.error.trim()) {
      return error.error;
    }

    if (typeof error?.error === 'object' && typeof error.error?.detail === 'string' && error.error.detail.trim()) {
      return error.error.detail;
    }

    if (error?.status === 0) {
      return 'The backend profile service could not be reached. Make sure the FastAPI server is running.';
    }

    if (error?.status === 404) {
      return 'The requested profile endpoint was not found. Restart the backend so the latest profile routes are loaded.';
    }

    return fallback;
  }

  private async readProfilePhoto(file: File): Promise<string> {
    const dataUrl = await this.readFileAsDataUrl(file);
    return this.optimizeProfilePhoto(dataUrl, file.type);
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error('Invalid file reader result.'));
      };
      reader.onerror = () => reject(new Error('The selected image could not be read.'));
      reader.readAsDataURL(file);
    });
  }

  private optimizeProfilePhoto(dataUrl: string, mimeType: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const maxDimension = 512;
        const longestSide = Math.max(image.width, image.height);
        const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
          reject(new Error('Canvas rendering is unavailable.'));
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);

        const outputType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
        const optimizedDataUrl =
          outputType === 'image/png' ? canvas.toDataURL(outputType) : canvas.toDataURL(outputType, 0.82);

        if (optimizedDataUrl.length > 2_000_000) {
          reject(new Error('The selected image is still too large after optimization.'));
          return;
        }

        resolve(optimizedDataUrl);
      };
      image.onerror = () => reject(new Error('The selected image could not be processed.'));
      image.src = dataUrl;
    });
  }

  private static passwordValidator(control: AbstractControl): ValidationErrors | null {
    const currentPassword = control.get('currentPassword')?.value?.trim() ?? '';
    const newPassword = control.get('newPassword')?.value?.trim() ?? '';
    const confirmPassword = control.get('confirmPassword')?.value?.trim() ?? '';

    if (currentPassword && !newPassword) {
      return { newPasswordRequired: true };
    }

    if (newPassword && !currentPassword) {
      return { currentPasswordRequired: true };
    }

    if (newPassword && newPassword !== confirmPassword) {
      return { passwordMismatch: true };
    }

    return null;
  }
}
