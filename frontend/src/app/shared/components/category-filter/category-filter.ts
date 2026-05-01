import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CategoryOption, NewsCategory } from '../../../core/models/category.model';
import { NewsDataType, NewsFilters, SelectOption } from '../../../core/models/filter.model';

@Component({
  selector: 'app-category-filter',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './category-filter.html',
  styleUrl: './category-filter.css'
})
export class CategoryFilterComponent {
  @Input({ required: true }) categories: CategoryOption[] = [];
  @Input({ required: true }) selectedCategory: NewsCategory = 'all';
  @Input({ required: true }) countryOptions: SelectOption[] = [];
  @Input({ required: true }) sourceOptions: SelectOption[] = [];
  @Input({ required: true }) dataTypeOptions: SelectOption[] = [];
  @Input({ required: true }) filters: NewsFilters = {
    category: 'all',
    country: '',
    source: '',
    date: '',
    dataType: ''
  };

  @Output() filtersChange = new EventEmitter<NewsFilters>();

  onSelect(category: NewsCategory): void {
    this.filtersChange.emit({
      ...this.filters,
      category
    });
  }

  onCountryChange(value: string): void {
    this.filtersChange.emit({
      ...this.filters,
      country: value
    });
  }

  onSourceChange(value: string): void {
    this.filtersChange.emit({
      ...this.filters,
      source: value
    });
  }

  onDateChange(value: string): void {
    this.filtersChange.emit({
      ...this.filters,
      date: value
    });
  }

  onDataTypeChange(value: NewsDataType | ''): void {
    this.filtersChange.emit({
      ...this.filters,
      dataType: value
    });
  }

  trackByCategoryValue(_: number, option: CategoryOption): string {
    return option.value;
  }

  trackByOptionValue(_: number, option: SelectOption): string {
    return option.value;
  }
}
