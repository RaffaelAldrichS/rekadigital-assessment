import { pool } from '../../db/pool';
import { buildDynamicFilterPredicates } from '../filters/filter-predicate';
import { LISTING_BASE_COLUMNS, SORT_COLUMNS } from '../listings/listing.repository';
import { Listing } from '../listings/listing.types';
import {
  FacetOptionRow,
  FacetQueryRow,
  FacetResult,
  MAX_FACET_OPTIONS,
  SearchRepositoryParams,
  Suggestion,
  SuggestionType,
} from './search.types';

interface SearchScope {
  joins: string[];
  conditions: string[];
  values: unknown[];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export class SearchRepository {
  async search(params: SearchRepositoryParams & { maxRows: number; sort: NonNullable<SearchRepositoryParams['sort']> }): Promise<Listing[]> {
    const scope = this.buildScope(params, []);
    const { joins, conditions, values } = scope;
    const sortColumn = SORT_COLUMNS[params.sort];

    if (params.cursor) {
      values.push(params.cursor.value, params.cursor.id);
      conditions.push(`(${sortColumn}, l.id) < ($${values.length - 1}, $${values.length})`);
    }
    values.push(params.maxRows);

    const result = await pool.query<Listing>(
      `
        SELECT
          ${LISTING_BASE_COLUMNS}
        FROM listings l
        ${joins.join('\n        ')}
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${sortColumn} DESC, l.id DESC
        LIMIT $${values.length};
      `,
      values
    );
    return result.rows;
  }

  async suggest(q: string, type: SuggestionType | undefined, limit: number): Promise<Suggestion[]> {
    const pattern = `${escapeLike(q)}%`;
    const branches: string[] = [];

    if (type === undefined || type === 'make') {
      branches.push(`(
        SELECT 'make'::text AS type, MIN(slug)::text AS value, MIN(name)::text AS label
        FROM makes
        WHERE name ILIKE $1 ESCAPE '\\'
        GROUP BY LOWER(name)
        ORDER BY LOWER(name), value
        LIMIT $2
      )`);
    }
    if (type === undefined || type === 'model') {
      branches.push(`(
        SELECT 'model'::text AS type, MIN(id::text)::uuid::text AS value, MIN(name)::text AS label
        FROM models
        WHERE name ILIKE $1 ESCAPE '\\'
        GROUP BY LOWER(name)
        ORDER BY LOWER(name), value
        LIMIT $2
      )`);
    }
    if (type === undefined || type === 'city') {
      branches.push(`(
        SELECT 'city'::text AS type, MIN(city)::text AS value, MIN(city)::text AS label
        FROM listings
        WHERE status <> 'removed' AND city ILIKE $1 ESCAPE '\\'
        GROUP BY LOWER(city)
        ORDER BY LOWER(city), value
        LIMIT $2
      )`);
    }

    const result = await pool.query<Suggestion>(
      `
        SELECT type, value, label
        FROM (
          ${branches.join('\n          UNION ALL\n          ')}
        ) suggestions
        ORDER BY type, label, value;
      `,
      [pattern, limit]
    );
    return result.rows;
  }

  async getFacets(params: SearchRepositoryParams, attributeIds: string[]): Promise<FacetResult> {
    const scope = this.buildScope(params, []);
    scope.values.push(attributeIds);
    const attributeParameter = scope.values.length;
    scope.values.push(MAX_FACET_OPTIONS);
    const limitParameter = scope.values.length;

    const result = await pool.query<FacetQueryRow>(
      `
        WITH scoped AS MATERIALIZED (
          SELECT
            l.id,
            l.model_id,
            m.make_id,
            mk.slug AS make_slug,
            mk.name AS make_name,
            m.name AS model_name,
            l.transmission,
            l.fuel_type,
            l.status
          FROM listings l
          ${scope.joins.join('\n          ')}
          WHERE ${scope.conditions.join(' AND ')}
        ),
        scalar_counts AS (
          SELECT 'make'::text AS key, make_slug::text AS value, make_name::text AS label, COUNT(*)::int AS count
          FROM scoped GROUP BY make_slug, make_name
          UNION ALL
          SELECT 'model'::text, model_id::text, model_name, COUNT(*)::int
          FROM scoped GROUP BY model_id, model_name
          UNION ALL
          SELECT 'transmission'::text, transmission, transmission, COUNT(*)::int
          FROM scoped GROUP BY transmission
          UNION ALL
          SELECT 'fuel_type'::text, fuel_type, fuel_type, COUNT(*)::int
          FROM scoped GROUP BY fuel_type
          UNION ALL
          SELECT 'status'::text, status, status, COUNT(*)::int
          FROM scoped GROUP BY status
        ),
        ranked_scalars AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY key ORDER BY value) AS position
          FROM scalar_counts
        ),
        value_counts AS (
          SELECT
            lav.attribute_id,
            lav.value_text AS value,
            COUNT(*)::int AS count,
            MIN(fao.sort_order) AS option_sort_order,
            MIN(fao.id::text)::uuid AS option_id
          FROM scoped s
          JOIN listing_attribute_values lav ON lav.listing_id = s.id
          JOIN filter_attribute_options fao
            ON fao.attribute_id = lav.attribute_id
            AND fao.value = lav.value_text
          WHERE lav.attribute_id = ANY($${attributeParameter}::uuid[])
          GROUP BY lav.attribute_id, lav.value_text
        ),
        ranked_values AS (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY attribute_id
            ORDER BY option_sort_order, option_id, value
          ) AS position
          FROM value_counts
        )
        SELECT
          'total'::text AS kind,
          0 AS position,
          NULL::uuid AS "attributeId",
          NULL::text AS key,
          NULL::text AS value,
          NULL::text AS label,
          0::int AS count,
          COUNT(*)::int AS total
        FROM scoped
        UNION ALL
        SELECT
          'scalar'::text,
          position,
          NULL::uuid,
          key,
          value,
          label,
          count,
          NULL::int
        FROM ranked_scalars
        WHERE position <= $${limitParameter}
        UNION ALL
        SELECT
          'dynamic'::text,
          position,
          attribute_id,
          NULL::text,
          value,
          value,
          count,
          NULL::int
        FROM ranked_values
        WHERE position <= $${limitParameter}
        ORDER BY kind, key NULLS FIRST, value NULLS FIRST;
      `,
      scope.values
    );

    const totalRow = result.rows.find((row) => row.kind === 'total');
    const scalarOptions = result.rows
      .filter((row) => row.kind === 'scalar' && row.key !== null && row.value !== null && row.label !== null)
      .map((row) => ({ key: row.key!, value: row.value!, label: row.label!, count: row.count }));
    const dynamicCounts = result.rows
      .filter((row) => row.kind === 'dynamic' && row.attributeId !== null && row.value !== null)
      .map((row) => ({ attributeId: row.attributeId!, value: row.value!, count: row.count }));

    return { total: totalRow?.total ?? 0, scalarOptions, dynamicCounts };
  }

  private buildScope(params: SearchRepositoryParams, values: unknown[]): SearchScope {
    const conditions: string[] = [`l.status <> 'removed'`];
    const joins = ['JOIN models m ON m.id = l.model_id', 'JOIN makes mk ON mk.id = m.make_id'];

    if (params.q !== undefined) {
      values.push(params.q);
      conditions.push(`l.search_vector @@ websearch_to_tsquery('english', $${values.length})`);
    }
    if (params.categoryId !== undefined) {
      values.push(params.categoryId);
      joins.push(`JOIN category_closure cc ON cc.ancestor_id = $${values.length} AND cc.descendant_id = l.category_id`);
    }
    if (params.make !== undefined) {
      values.push(params.make);
      const parameter = values.length;
      conditions.push(`(mk.id::text = $${parameter} OR mk.slug = $${parameter} OR LOWER(mk.name) = LOWER($${parameter}))`);
    }
    if (params.model !== undefined) {
      values.push(params.model);
      const parameter = values.length;
      conditions.push(`(m.id::text = $${parameter} OR m.slug = $${parameter} OR LOWER(m.name) = LOWER($${parameter}))`);
    }
    if (params.minPrice !== undefined) {
      values.push(params.minPrice);
      conditions.push(`l.price >= $${values.length}`);
    }
    if (params.maxPrice !== undefined) {
      values.push(params.maxPrice);
      conditions.push(`l.price <= $${values.length}`);
    }
    if (params.minYear !== undefined) {
      values.push(params.minYear);
      conditions.push(`l.year >= $${values.length}`);
    }
    if (params.maxYear !== undefined) {
      values.push(params.maxYear);
      conditions.push(`l.year <= $${values.length}`);
    }
    if (params.fuelType !== undefined) {
      values.push(params.fuelType);
      conditions.push(`l.fuel_type = $${values.length}`);
    }
    if (params.transmission !== undefined) {
      values.push(params.transmission);
      conditions.push(`l.transmission = $${values.length}`);
    }
    if (params.status !== undefined) {
      values.push(params.status);
      conditions.push(`l.status = $${values.length}`);
    }
    conditions.push(...buildDynamicFilterPredicates(params.dynamicFilters ?? [], values));

    return { joins, conditions, values };
  }
}
