import { ValidationError } from '../../shared/errors/app-error';
import { FilterRepository } from './filter.repository';
import { validateDynamicFilters } from './filter-predicate';
import { CategoryFilterMetadata, ValidatedDynamicFilter } from './filter.types';

export class FilterService {
  constructor(private filterRepo: FilterRepository = new FilterRepository()) {}

  async getCategoryFilters(categoryId: string): Promise<CategoryFilterMetadata> {
    return this.filterRepo.findByCategoryId(categoryId);
  }

  async prepareDynamicFilters(categoryId: string | undefined, rawFilters: string | undefined): Promise<ValidatedDynamicFilter[]> {
    if (rawFilters === undefined) {
      return [];
    }
    if (categoryId === undefined) {
      throw new ValidationError('categoryId is required when dynamic filters are provided');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawFilters);
    } catch {
      throw new ValidationError('Dynamic filters must be valid JSON');
    }

    const metadata = await this.filterRepo.findByCategoryId(categoryId);
    return validateDynamicFilters(parsed, metadata.filters);
  }
}
