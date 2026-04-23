import { Component, Output, EventEmitter, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthResponse } from '../../../core/models/user.model';

@Component({
  selector: 'app-login-form',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login-form.html',
  styleUrls: ['./login-form.css']
})
export class LoginForm {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  form = {
    email: '',
    password: ''
  };

  errorMessage: string = '';
  showPassword: boolean = false;
  isLoading: boolean = false;

  @Output() loginSuccess = new EventEmitter<AuthResponse>();
  @Output() switchToSignup = new EventEmitter<void>();

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  onSubmit() {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.http.post<AuthResponse>('http://127.0.0.1:8000/login', this.form).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.loginSuccess.emit(res);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.detail || 'Invalid email or password.';
        this.cdr.detectChanges();
      }
    });
  }
}
