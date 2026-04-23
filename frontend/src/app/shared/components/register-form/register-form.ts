import { Component, Output, EventEmitter, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';

@Component({
  selector: 'app-register-form',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './register-form.html',
  styleUrls: ['./register-form.css']
})
export class RegisterForm {
  form = {
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  };

  private http = inject(HttpClient);
  private emailCheck$ = new Subject<string>();
  emailExists: boolean = false;

  errorMessage: string = '';
  showPassword: boolean = false;
  isLoading: boolean = false;
  isCheckingEmail: boolean = false;

  @Output() nextStep = new EventEmitter<any>();

  constructor() {
    this.emailCheck$.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      switchMap(email => {
        if (!email || !email.includes('@')) return [null];
        this.isCheckingEmail = true;
        return this.http.get<{ exists: boolean }>(`http://127.0.0.1:8000/check-email/${email}`);
      })
    ).subscribe({
      next: (res) => {
        this.isCheckingEmail = false;
        if (res) {
          this.emailExists = res.exists;
          if (this.emailExists) {
            this.errorMessage = 'This email is already registered!';
          } else if (this.errorMessage === 'This email is already registered!') {
            this.errorMessage = '';
          }
        }
      },
      error: () => {
        this.isCheckingEmail = false;
      }
    });
  }

  onEmailChange() {
    this.emailCheck$.next(this.form.email);
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  onSubmit() {
    if (this.emailExists) {
      this.errorMessage = 'Please use a different email address.';
      return;
    }
    if (this.form.password !== this.form.confirmPassword) {
      this.errorMessage = 'Passwords do not match!';
      return;
    }

    this.errorMessage = '';
    // No longer calling backend here. Just emit the data for the next step.
    this.nextStep.emit({
      full_name: this.form.name,
      email: this.form.email,
      password: this.form.password
    });
  }
}