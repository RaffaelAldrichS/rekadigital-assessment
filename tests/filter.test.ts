import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db/pool';
import { ListingRepository } from '../src/modules/listings/listing.repository';
import { FilterRepository } from '../src/modules/filters/filter.repository';
import {
  buildDynamicFilterPredicates,
  validateDynamicFilters,
} from '../src/modules/filters/filter-predicate';
import { FilterService } from '../src/modules/filters/filter.service';
import { browseListingsQuerySchema } from '../src/modules/listings/listing.schema';
import { ValidationError } from '../src/shared/errors/app-error';

const CATEGORY_ID = 'a60effa6-45f7-48ae-bcef-079ad5a2b91d';
const FUEL_ID = 'b7e4a1c2-9d3f-4a6e-8c1b-5f2e9d7a4c31';
const SEATS_ID = 'c8f5b2d3-0e4a-4b7f-9d2c-6a3f0e8b5d42';
const SUNROOF_ID = 'd9a6c3e4-1f5b-4c8a-8e3d-7b4a1f9c6e53';

const metadata = [
  {
    id: FUEL_ID,
    key: 'fuel_type',
    name: 'Fuel Type',
    type: 'enum' as const,
    required: false,
    options: [
      { id: '11111111-1111-4111-8111-111111111111', value: 'gasoline', label: 'Gasoline', sortOrder: 0 },
      { id: '22222222-2222-4222-8222-222222222222', value: 'diesel', label: 'Diesel', sortOrder: 1 },
    ],
  },
  {
    id: SEATS_ID,
    key: 'seats',
    name: 'Seats',
    type: 'range' as const,
    required: false,
    options: [],
  },
  {
    id: SUNROOF_ID,
    key: 'sunroof',
    name: 'Sunroof',
    type: 'boolean' as const,
    required: false,
    options: [],
  },
];

function jsonMetadataRows() {
  return [
    {
      id: FUEL_ID,
      key: 'fuel_type',
      name: 'Fuel Type',
      type: 'enum',
      required: false,
      optionId: '11111111-1111-4111-8111-111111111111',
      optionValue: 'gasoline',
      optionLabel: 'Gasoline',
      sortOrder: 0,
    },
    {
      id: FUEL_ID,
      key: 'fuel_type',
      name: 'Fuel Type',
      type: 'enum',
      required: false,
      optionId: '22222222-2222-4222-8222-222222222222',
      optionValue: 'diesel',
      optionLabel: 'Diesel',
      sortOrder: 1,
    },
    {
      id: SEATS_ID,
      key: 'seats',
      name: 'Seats',
      type: 'range',
      required: false,
      optionId: null,
      optionValue: null,
      optionLabel: null,
      sortOrder: null,
    },
    {
      id: SUNROOF_ID,
      key: 'sunroof',
      name: 'Sunroof',
      type: 'boolean',
      required: false,
      optionId: null,
      optionValue: null,
      optionLabel: null,
      sortOrder: null,
    },
  ];
}

function mockFilterPool() {
  return vi.spyOn(pool, 'query').mockImplementation((async (sql: any) => {
    const text = typeof sql === 'string' ? sql : sql.text;
    if (text.includes('SELECT id FROM categories')) {
      return { rows: [{ id: CATEGORY_ID }] };
    }
    if (text.includes('filter_attributes')) {
      return { rows: jsonMetadataRows() };
    }
    return { rows: [] };
  }) as any);
}

describe('Ticket 05 — Dynamic category-specific filters', () => {
  describe('filter metadata and validation', () => {
    it('returns only category mappings with type and enum options', async () => {
      mockFilterPool();
      const repository = new FilterRepository();

      const result = await repository.findByCategoryId(CATEGORY_ID);

      expect(result.filters.map((filter) => filter.key)).toEqual(['fuel_type', 'seats', 'sunroof']);
      expect(result.filters[0]).toMatchObject({ type: 'enum', required: false });
      expect(result.filters[0].options).toEqual([
        { id: '11111111-1111-4111-8111-111111111111', value: 'gasoline', label: 'Gasoline', sortOrder: 0 },
        { id: '22222222-2222-4222-8222-222222222222', value: 'diesel', label: 'Diesel', sortOrder: 1 },
      ]);
      expect(result.filters[1].options).toEqual([]);
    });

    it('rejects invalid enum options, value types, and ranges', () => {
      expect(() => validateDynamicFilters({ fuel_type: 'electric' }, metadata)).toThrow(ValidationError);
      expect(() => validateDynamicFilters({ seats: { min: 'five' } }, metadata)).toThrow(ValidationError);
      expect(() => validateDynamicFilters({ seats: { min: 8, max: 5 } }, metadata)).toThrow(ValidationError);
      expect(() => validateDynamicFilters({ sunroof: 'true' }, metadata)).toThrow(ValidationError);
    });

    it('rejects an attribute not mapped to the category', () => {
      expect(() => validateDynamicFilters({ transmission: 'manual' }, metadata)).toThrow(
        'Attribute "transmission" is not available for the selected category'
      );
    });
  });

  describe('dynamic predicate builder', () => {
    it('builds enum, range, and boolean predicates with parameter placeholders', () => {
      const filters = validateDynamicFilters(
        { fuel_type: 'diesel', seats: { min: 5, max: 7 }, sunroof: true },
        metadata
      );
      const values: unknown[] = [];

      const predicates = buildDynamicFilterPredicates(filters, values);

      expect(predicates).toHaveLength(3);
      expect(predicates.every((predicate) => predicate.includes('listing_attribute_values'))).toBe(true);
      expect(predicates[0]).toContain('lav.value_text = $2');
      expect(predicates[1]).toContain('lav.value_numeric >= $4');
      expect(predicates[1]).toContain('lav.value_numeric <= $5');
      expect(predicates[2]).toContain('lav.value_boolean = $7');
      expect(values).toEqual([FUEL_ID, 'diesel', SEATS_ID, 5, 7, SUNROOF_ID, true]);
      expect(predicates.join(' ')).not.toContain('diesel');
    });

    it('does not interpolate an injection-shaped value into SQL identifiers or text', () => {
      const filters = validateDynamicFilters({ fuel_type: 'diesel' }, metadata);
      const values: unknown[] = [];
      const predicates = buildDynamicFilterPredicates(filters, values);
      const attemptedValue = 'diesel\'; DROP TABLE listings; --';
      const unsafeFilters = validateDynamicFilters({ fuel_type: attemptedValue }, [
        {
          ...metadata[0],
          options: [...metadata[0].options, { id: '33333333-3333-4333-8333-333333333333', value: attemptedValue, label: 'Unsafe', sortOrder: 2 }],
        },
      ]);
      const unsafeValues: unknown[] = [];
      const unsafePredicates = buildDynamicFilterPredicates(unsafeFilters, unsafeValues);

      expect(values).toEqual([FUEL_ID, 'diesel']);
      expect(unsafeValues).toEqual([FUEL_ID, attemptedValue]);
      expect(unsafePredicates.join(' ')).not.toContain(attemptedValue);
      expect(unsafePredicates.join(' ')).toContain('$1');
      expect(predicates.join(' ')).toContain('$1');
    });
  });

  describe('listing query composition', () => {
    it('combines scalar filters, category scope, dynamic predicates, and removed exclusion', async () => {
      const filters = validateDynamicFilters({ fuel_type: 'diesel', seats: { min: 5 } }, metadata);
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      await new ListingRepository().browse({
        maxRows: 21,
        sort: 'created_at',
        cursor: null,
        categoryId: CATEGORY_ID,
        make: 'toyota',
        minPrice: 100,
        maxPrice: 500,
        minYear: 2020,
        fuelType: 'diesel',
        status: 'available',
        dynamicFilters: filters,
      });

      const [sql, params] = querySpy.mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toContain("l.status <> 'removed'");
      expect(sql).toContain('cc.ancestor_id = $');
      expect(sql).toContain('l.price >= $');
      expect(sql).toContain('l.price <= $');
      expect(sql).toContain('l.year >= $');
      expect(sql).toContain('l.fuel_type = $');
      expect(sql).toContain('l.status = $');
      expect(sql).toContain('ORDER BY l.created_at DESC, l.id DESC');
      expect(params).toEqual(expect.arrayContaining([CATEGORY_ID, 'toyota', 100, 500, 2020, 'diesel', 'available', FUEL_ID, SEATS_ID]));
      expect(params.at(-1)).toBe(21);
    });

    it('returns an empty page without weakening the removed listing exclusion', async () => {
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      await new ListingRepository().browse({ maxRows: 21, sort: 'created_at', cursor: null });

      const [sql] = querySpy.mock.calls[0] as unknown as [string];
      expect(sql).toContain("l.status <> 'removed'");
    });
  });

  describe('HTTP metadata and invalid requests', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('returns category filters in the response envelope', async () => {
      mockFilterPool();

      const response = await request(app).get(`/api/v1/filters/${CATEGORY_ID}`);

      expect(response.status).toBe(200);
      expect(response.body.data.categoryId).toBe(CATEGORY_ID);
      expect(response.body.data.filters).toHaveLength(3);
    });

    it('rejects malformed filter JSON, invalid ranges, and unsupported attributes', async () => {
      mockFilterPool();

      const malformed = await request(app).get(`/api/v1/listings?filters=${encodeURIComponent('{')}`);
      expect(malformed.status).toBe(400);
      expect(malformed.body.error.code).toBe('VALIDATION_ERROR');

      const invalidRange = await request(app).get(
        `/api/v1/listings?categoryId=${CATEGORY_ID}&filters=${encodeURIComponent(JSON.stringify({ seats: { min: 8, max: 5 } }))}`
      );
      expect(invalidRange.status).toBe(400);
      expect(invalidRange.body.error.code).toBe('VALIDATION_ERROR');

      const unsupported = await request(app).get(
        `/api/v1/listings?categoryId=${CATEGORY_ID}&filters=${encodeURIComponent(JSON.stringify({ transmission: 'manual' }))}`
      );
      expect(unsupported.status).toBe(400);
      expect(unsupported.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts the documented dynamic filters query parameter and scalar fields', () => {
      const parsed = browseListingsQuerySchema.parse({
        categoryId: CATEGORY_ID,
        make: 'toyota',
        minPrice: '100',
        maxPrice: '500',
        minYear: '2020',
        fuelType: 'diesel',
        status: 'available',
        filters: JSON.stringify({ fuel_type: 'diesel' }),
      });

      expect(parsed).toMatchObject({ categoryId: CATEGORY_ID, make: 'toyota', minPrice: 100, maxPrice: 500 });
      expect(parsed.filters).toContain('fuel_type');
    });
  });
});
