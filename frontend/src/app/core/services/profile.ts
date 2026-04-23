import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  UpdateProfileDetailsPayload,
  UpdateProfilePhotoPayload,
  UpdateProfileResponse,
  UserProfile
} from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.backendApiBaseUrl;

  getProfile(userId: number): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.apiBaseUrl}/users/${userId}`);
  }

  updateProfileDetails(userId: number, payload: UpdateProfileDetailsPayload): Observable<UpdateProfileResponse> {
    return this.http.put<UpdateProfileResponse>(`${this.apiBaseUrl}/users/${userId}/profile`, payload);
  }

  updateProfilePhoto(userId: number, payload: UpdateProfilePhotoPayload): Observable<UpdateProfileResponse> {
    return this.http.put<UpdateProfileResponse>(`${this.apiBaseUrl}/users/${userId}/profile/photo`, payload);
  }

  removeProfilePhoto(userId: number): Observable<UpdateProfileResponse> {
    return this.http.delete<UpdateProfileResponse>(`${this.apiBaseUrl}/users/${userId}/profile/photo`);
  }
}
