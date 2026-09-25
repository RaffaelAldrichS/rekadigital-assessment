export type FilterAttributeType = 'enum' | 'range' | 'boolean';

export interface FilterAttributeOption {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
}

export interface FilterAttributeDefinition {
  id: string;
  key: string;
  name: string;
  type: FilterAttributeType;
  required: boolean;
  options: FilterAttributeOption[];
}

export interface CategoryFilterMetadata {
  categoryId: string;
  filters: FilterAttributeDefinition[];
}

export type DynamicFilterValue = string | string[] | boolean | { min?: number; max?: number };

export interface ValidatedDynamicFilter {
  key: string;
  attributeId: string;
  type: FilterAttributeType;
  value: DynamicFilterValue;
}
