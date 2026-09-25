import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db/pool';
import { facetsQuerySchema, searchListingsQuerySchema, suggestQuerySchema } from '../src/modules/search/search.schema';
import { SearchRepository } from '../src/modules/search/search.repository';

const CATEGORY_ID = 'a60effa6-45f7-48ae-bcef-079ad5a2b91d';
const ATTRIBUTE_ID = 'b7e4a1c2-9d3f-4a6e-8c1b-5f2e9d7a4c31';
const INJECTION = "Aurora' OR 1=1; DROP TABLE listings; --";

describe('Ticket 06 — search query safety and validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parameterizes search, scalar, and dynamic values without OFFSET', async () => {
    const query = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

    await new SearchRepository().search({
      q: INJECTION,
      maxRows: 21,
      sort: 'created_at',
      cursor: null,
      make: INJECTION,
      model: INJECTION,
      minPrice: 100,
      maxPrice: 500,
      minYear: 2020,
      maxYear: 2025,
      fuelType: INJECTION,
      transmission: INJECTION,
      categoryId: CATEGORY_ID,
      status: 'available',
      dynamicFilters: [
        {
          key: 'color',
          attributeId: ATTRIBUTE_ID,
          type: 'enum',
          value: INJECTION,
        },
      ],
    });

    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("l.search_vector @@ websearch_to_tsquery('english', $1)");
    expect(sql).toContain("l.status <> 'removed'");
    expect(sql).toContain('JOIN category_closure cc');
    expect(sql).toContain('ORDER BY l.created_at DESC, l.id DESC');
    expect(sql.match(/EXISTS \(SELECT 1 FROM listing_attribute_values lav/g)).toHaveLength(1);
    expect(sql).not.toContain(INJECTION);
    expect(sql).not.toMatch(/\bOFFSET\b/);
    expect(params).toEqual(expect.arrayContaining([INJECTION, CATEGORY_ID, 100, 500, 2020, 2025, ATTRIBUTE_ID]));
    expect(params.at(-1)).toBe(21);
  });

  it('uses fixed SQL branches for allowlisted suggestion types', async () => {
    const query = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

    await new SearchRepository().suggest('Toyota', 'model', 5);

    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("'model'::text AS type");
    expect(sql).not.toContain("'make'::text AS type");
    expect(sql).not.toContain("'city'::text AS type");
    expect(sql).not.toContain('Toyota');
    expect(params).toEqual(['Toyota%', 5]);
  });

  it('rejects user-controlled sort identifiers and malformed suggestion input', () => {
    expect(searchListingsQuerySchema.safeParse({ q: 'Aurora', sort: 'id; DROP TABLE listings' }).success).toBe(false);
    expect(suggestQuerySchema.safeParse({ q: "Toyota'; DROP TABLE listings; --" }).success).toBe(false);
    expect(suggestQuerySchema.safeParse({ q: 'Toyota', type: 'category_id' }).success).toBe(false);
    expect(facetsQuerySchema.safeParse({ q: '', minPrice: -1 }).success).toBe(false);
    expect(searchListingsQuerySchema.safeParse({ q: 'Aurora\u0000' }).success).toBe(false);
    expect(facetsQuerySchema.safeParse({ q: 'Aurora\u001f' }).success).toBe(false);
  });
});
