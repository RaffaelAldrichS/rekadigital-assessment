import { ValidationError } from '../../shared/errors/app-error';
import { FilterAttributeDefinition, ValidatedDynamicFilter } from './filter.types';

const VALUE_COLUMNS = {
  enum: 'value_text',
  range: 'value_numeric',
  boolean: 'value_boolean',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateDynamicFilters(
  raw: unknown,
  definitions: FilterAttributeDefinition[]
): ValidatedDynamicFilter[] {
  if (!isRecord(raw)) {
    throw new ValidationError('Dynamic filters must be a JSON object');
  }

  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  return Object.entries(raw).map(([key, value]) => {
    const definition = definitionsByKey.get(key);
    if (!definition) {
      throw new ValidationError(`Attribute "${key}" is not available for the selected category`);
    }

    return { key, attributeId: definition.id, type: definition.type, value: validateValue(definition, value) };
  });
}

function validateValue(definition: FilterAttributeDefinition, value: unknown): ValidatedDynamicFilter['value'] {
  if (definition.type === 'enum') {
    const values = Array.isArray(value) ? value : [value];
    if (values.length === 0 || values.some((option) => typeof option !== 'string')) {
      throw new ValidationError(`Attribute "${definition.key}" expects a string enum value`);
    }
    const allowedValues = new Set(definition.options.map((option) => option.value));
    if (values.some((option) => !allowedValues.has(option))) {
      throw new ValidationError(`Value for enum attribute "${definition.key}" is invalid`);
    }
    return values.length === 1 ? values[0] as string : values as string[];
  }

  if (definition.type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new ValidationError(`Attribute "${definition.key}" expects a boolean value`);
    }
    return value;
  }

  if (!isRecord(value) || (value.min === undefined && value.max === undefined)) {
    throw new ValidationError(`Attribute "${definition.key}" expects a numeric min and/or max value`);
  }
  if (Object.keys(value).some((key) => key !== 'min' && key !== 'max')) {
    throw new ValidationError(`Attribute "${definition.key}" contains unsupported range fields`);
  }
  const min = value.min;
  const max = value.max;
  if ((min !== undefined && (typeof min !== 'number' || !Number.isFinite(min))) ||
      (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max)))) {
    throw new ValidationError(`Attribute "${definition.key}" expects numeric range bounds`);
  }
  if (min !== undefined && max !== undefined && min > max) {
    throw new ValidationError(`Attribute "${definition.key}" range minimum cannot exceed maximum`);
  }
  return {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
  };
}

export function buildDynamicFilterPredicates(
  filters: ValidatedDynamicFilter[],
  values: unknown[]
): string[] {
  return filters.map((filter) => {
    const column = VALUE_COLUMNS[filter.type];
    const attributeParameter = values.length + 1;
    values.push(filter.attributeId);
    const valueConditions: string[] = [];

    if (filter.type === 'enum') {
      const options = Array.isArray(filter.value) ? filter.value : [filter.value];
      if (options.length === 1) {
        const parameter = values.length + 1;
        values.push(options[0]);
        valueConditions.push(`lav.${column} = $${parameter}`);
      } else {
        const optionParameters = options.map((option) => {
          const parameter = values.length + 1;
          values.push(option);
          return `$${parameter}`;
        });
        valueConditions.push(`lav.${column} IN (${optionParameters.join(', ')})`);
      }
    } else if (filter.type === 'range') {
      const range = filter.value as { min?: number; max?: number };
      if (range.min !== undefined) {
        const parameter = values.length + 1;
        values.push(range.min);
        valueConditions.push(`lav.${column} >= $${parameter}`);
      }
      if (range.max !== undefined) {
        const parameter = values.length + 1;
        values.push(range.max);
        valueConditions.push(`lav.${column} <= $${parameter}`);
      }
    } else {
      const parameter = values.length + 1;
      values.push(filter.value);
      valueConditions.push(`lav.${column} = $${parameter}`);
    }

    return `EXISTS (SELECT 1 FROM listing_attribute_values lav WHERE lav.listing_id = l.id AND lav.attribute_id = $${attributeParameter} AND ${valueConditions.join(' AND ')})`;
  });
}
