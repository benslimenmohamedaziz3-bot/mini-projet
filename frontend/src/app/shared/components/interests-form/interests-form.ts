import { Component, Output, EventEmitter, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { timeout } from 'rxjs';

@Component({
  selector: 'app-interests-form',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './interests-form.html',
  styleUrls: ['./interests-form.css']
})
export class InterestsForm implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  @Output() back = new EventEmitter<void>();
  @Output() complete = new EventEmitter<number[]>();

  interests: any[] = [];
  selected: number[] = [];
  errorMessage: string = '';
  readonly maxInterests = 3;

  ngOnInit() {
    this.http.get<any[]>('http://127.0.0.1:8000/interests')
      .pipe(timeout(10000))
      .subscribe({
        next: (data) => {
          this.interests = data;
          this.cdr.detectChanges();
          if (data.length === 0) {
            this.errorMessage = 'No interests found in the database.';
          }
        },
        error: (err) => {
          console.error('Interests load error:', err);
          this.errorMessage = 'Could not fetch interests. Please check your connection.';
          this.cdr.detectChanges();
        }
      });
  }

  toggleInterest(id: number) {
    if (this.selected.includes(id)) {
      this.selected = this.selected.filter(i => i !== id);
      this.errorMessage = '';
    } else {
      if (this.selected.length >= this.maxInterests) {
        this.errorMessage = `You can select up to ${this.maxInterests} interests.`;
        this.cdr.detectChanges();
        return;
      }

      this.selected.push(id);
      this.errorMessage = '';
    }
  }

  submit() {
    if (this.selected.length > this.maxInterests) {
      this.errorMessage = `You can select up to ${this.maxInterests} interests.`;
      this.cdr.detectChanges();
      return;
    }

    this.complete.emit(this.selected);
  }
}
