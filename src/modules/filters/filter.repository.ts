import { pool } from '../../db/pool';
import { NotFoundError } from '../../shared/errors/app-error';
import { CategoryFilterMetadata, FilterAttributeDefinition, FilterAttributeType } from './filter.types';

interface MetadataRow {
  id: string;
  key: string;
  name: string;
  type: FilterAttributeType;
  required: boolean;
  optionId: string | null;
  optionValue: string | null;
  optionLabel: string | null;
  sortOrder: number | null;
}

export class FilterRepository {
  async findByCategoryId(categoryId: string): Promise<CategoryFilterMetadata> {
    const categoryResult = await pool.query<{ id: string }>(
      'SELECT id FROM categories WHERE id = $1',
      [categoryId]
    );
    if (categoryResult.rows.length === 0) {
      throw new NotFoundError('Category not found');
    }

    const result = await pool.query<MetadataRow>(
      `
        SELECT
          fa.id,
          fa.key,
          fa.name,
          fa.type,
          cfa.required,
          fao.id as "optionId",
          fao.value as "optionValue",
          fao.label as "optionLabel",
          fao.sort_order as "sortOrder"
        FROM category_filter_attributes cfa
        JOIN filter_attributes fa ON fa.id = cfa.attribute_id
        LEFT JOIN filter_attribute_options fao ON fao.attribute_id = fa.id
        WHERE cfa.category_id = $1
        ORDER BY fa.key ASC, fao.sort_order ASC, fao.id ASC;
      `,
      [categoryId]
    );

    const definitions = new Map<string, FilterAttributeDefinition>();
    for (const row of result.rows) {
      let definition = definitions.get(row.id);
      if (!definition) {
        definition = {
          id: row.id,
          key: row.key,
          name: row.name,
          type: row.type,
          required: row.required,
          options: [],
        };
        definitions.set(row.id, definition);
      }
      if (row.optionId !== null && row.optionValue !== null && row.optionLabel !== null && row.sortOrder !== null) {
        definition.options.push({
          id: row.optionId,
          value: row.optionValue,
          label: row.optionLabel,
          sortOrder: row.sortOrder,
        });
      }
    }

    return { categoryId, filters: [...definitions.values()] };
  }
}
