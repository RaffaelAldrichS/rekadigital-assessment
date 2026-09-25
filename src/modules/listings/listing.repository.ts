import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../../db/pool';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import {
  CreateListingInput,
  FilterAttributeType,
  Listing,
  ListingAttributeValue,
  ListingAttributeInput,
  ListingCursor,
  ListingDetail,
  ListingImage,
  ListingSortField,
  UpdateListingInput,
} from './listing.types';

interface Queryable {
  query<T extends QueryResultRow>(queryText: string, values?: any[]): Promise<QueryResult<T>>;
}

function utcTimestamp(expr: string, alias: string): string {
  return `to_char(${expr} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "${alias}"`;
}

const LISTING_BASE_COLUMNS = `
  l.id,
  l.model_id as "modelId",
  l.category_id as "categoryId",
  l.title,
  l.description,
  l.year,
  l.mileage,
  l.price,
  l.condition,
  l.transmission,
  l.fuel_type as "fuelType",
  l.color,
  l.city,
  l.latitude,
  l.longitude,
  l.status,
  ${utcTimestamp('l.created_at', 'createdAt')},
  ${utcTimestamp('l.updated_at', 'updatedAt')}
`;

const SORT_COLUMNS: Record<ListingSortField, string> = {
  created_at: 'l.created_at',
  price: 'l.price',
  year: 'l.year',
  mileage: 'l.mileage',
};

const UPDATABLE_COLUMNS: Record<string, string> = {
  modelId: 'model_id',
  categoryId: 'category_id',
  title: 'title',
  description: 'description',
  year: 'year',
  mileage: 'mileage',
  price: 'price',
  condition: 'condition',
  transmission: 'transmission',
  fuelType: 'fuel_type',
  color: 'color',
  city: 'city',
  latitude: 'latitude',
  longitude: 'longitude',
  status: 'status',
};

interface AttributeRow {
  attributeId: string;
  key: string;
  type: FilterAttributeType;
  valueText: string | null;
  valueNumeric: string | null;
  valueBoolean: boolean | null;
}

interface AttributeMetadataRow {
  id: string;
  key: string;
  type: FilterAttributeType;
  mapped: string | null;
  required: boolean;
}

interface ImageRow {
  id: string;
  imageUrl: string;
  sortOrder: number;
}

interface DetailRow extends Listing {
  modelName: string;
  modelSlug: string;
  makeId: string;
  makeName: string;
  makeSlug: string;
  categoryName: string;
  categorySlug: string;
  categoryParentId: string | null;
}

function coerceAttributeValue(
  type: FilterAttributeType,
  value: string | number | boolean,
  key: string
): { valueText: string | null; valueNumeric: number | null; valueBoolean: boolean | null } {
  switch (type) {
    case 'enum': {
      if (typeof value !== 'string') {
        throw new ValidationError(`Attribute "${key}" expects a string value`);
      }
      return { valueText: value, valueNumeric: null, valueBoolean: null };
    }
    case 'range': {
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 99999999999) {
        throw new ValidationError(`Attribute "${key}" expects a numeric value`);
      }
      return { valueText: null, valueNumeric: value, valueBoolean: null };
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        throw new ValidationError(`Attribute "${key}" expects a boolean value`);
      }
      return { valueText: null, valueNumeric: null, valueBoolean: value };
    }
  }
}

export class ListingRepository {
  async create(input: CreateListingInput): Promise<ListingDetail> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await assertModelExists(client, input.modelId);
      await assertCategoryExists(client, input.categoryId);

      const insertRes = await client.query<{ id: string }>(
        `
        INSERT INTO listings (
          model_id, category_id, title, description, year, mileage, price,
          condition, transmission, fuel_type, color, city, latitude, longitude, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id;
      `,
        [
          input.modelId,
          input.categoryId,
          input.title,
          input.description ?? null,
          input.year,
          input.mileage,
          input.price,
          input.condition,
          input.transmission,
          input.fuelType,
          input.color,
          input.city,
          input.latitude ?? null,
          input.longitude ?? null,
          input.status ?? 'available',
        ]
      );
      const listingId = insertRes.rows[0].id;

      await this.insertImages(client, listingId, input.images ?? []);

      await this.insertAttributeValues(client, listingId, input.categoryId, input.attributes ?? []);

      const detail = await this.loadDetail(client, listingId);
      await client.query('COMMIT');
      return detail!;
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw mapRepositoryError(error);
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<ListingDetail | null> {
    return this.loadDetail(pool, id);
  }

  async browse(params: {
    maxRows: number;
    sort: ListingSortField;
    cursor: ListingCursor | null;
  }): Promise<Listing[]> {
    const sortColumn = SORT_COLUMNS[params.sort];
    const conditions: string[] = [`l.status <> 'removed'`];
    const values: unknown[] = [];

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
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortColumn} DESC, l.id DESC
      LIMIT $${values.length};
    `,
      values
    );
    return result.rows;
  }

  async update(id: string, input: UpdateListingInput): Promise<ListingDetail> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const currentRes = await client.query<{ id: string; categoryId: string }>(
        `
        SELECT id, category_id as "categoryId", status
        FROM listings
        WHERE id = $1 AND status <> 'removed'
        FOR UPDATE;
      `,
        [id]
      );
      if (currentRes.rows.length === 0) {
        throw new NotFoundError('Listing not found');
      }
      const currentCategoryId = currentRes.rows[0].categoryId;

      if (input.modelId !== undefined) {
        await assertModelExists(client, input.modelId);
      }

      const targetCategoryId = input.categoryId ?? currentCategoryId;
      if (input.categoryId !== undefined) {
        await assertCategoryExists(client, input.categoryId);
      }

      if (input.images !== undefined) {
        await client.query('DELETE FROM listing_images WHERE listing_id = $1', [id]);
        await this.insertImages(client, id, input.images);
      }

      if (input.categoryId !== undefined && input.categoryId !== currentCategoryId && input.attributes === undefined) {
        const existingAttributes = await this.loadExistingAttributes(client, id);
        await this.validateAttributeValues(client, targetCategoryId, existingAttributes);
      }

      if (input.attributes !== undefined) {
        await client.query('DELETE FROM listing_attribute_values WHERE listing_id = $1', [id]);
        await this.insertAttributeValues(client, id, targetCategoryId, input.attributes);
      }

      const setClauses: string[] = [];
      const values: unknown[] = [];
      for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
        const value = (input as Record<string, unknown>)[field];
        if (value !== undefined) {
          values.push(value);
          setClauses.push(`${column} = $${values.length}`);
        }
      }

      if (setClauses.length > 0) {
        values.push(id);
        await client.query(
          `UPDATE listings SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
          values
        );
      }

      const detail = await this.loadDetail(client, id);
      await client.query('COMMIT');
      return detail!;
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw mapRepositoryError(error);
    } finally {
      client.release();
    }
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE listings
      SET status = 'removed', updated_at = NOW()
      WHERE id = $1 AND status <> 'removed'
      RETURNING id;
    `,
      [id]
    );
    return result.rows.length > 0;
  }

  private async loadExistingAttributes(
    client: Queryable,
    listingId: string
  ): Promise<ListingAttributeInput[]> {
    const result = await client.query<AttributeRow>(
      `
      SELECT
        lav.attribute_id as "attributeId",
        fa.key,
        fa.type,
        lav.value_text as "valueText",
        lav.value_numeric as "valueNumeric",
        lav.value_boolean as "valueBoolean"
      FROM listing_attribute_values lav
      JOIN filter_attributes fa ON fa.id = lav.attribute_id
      WHERE lav.listing_id = $1
      ORDER BY fa.key ASC;
    `,
      [listingId]
    );

    return result.rows.map((attribute) => {
      const value =
        attribute.type === 'boolean'
          ? attribute.valueBoolean
          : attribute.type === 'range'
            ? attribute.valueNumeric
            : attribute.valueText;
      if (value === null) {
        throw new ValidationError(`Stored value for attribute "${attribute.key}" is invalid`);
      }
      return {
        attributeId: attribute.attributeId,
        value: attribute.type === 'range' ? Number(attribute.valueNumeric) : value,
      };
    });
  }

  private async insertImages(
    client: PoolClient,
    listingId: string,
    images: { imageUrl: string; sortOrder?: number }[]
  ): Promise<void> {
    if (images.length === 0) {
      return;
    }

    const values: unknown[] = [];
    const rows = images.map((image, index) => {
      const start = values.length;
      values.push(listingId, image.imageUrl, image.sortOrder ?? index);
      return `($${start + 1}, $${start + 2}, $${start + 3})`;
    });

    await client.query(
      `
      INSERT INTO listing_images (listing_id, image_url, sort_order)
      VALUES ${rows.join(', ')};
    `,
      values
    );
  }

  private async insertAttributeValues(
    client: PoolClient,
    listingId: string,
    categoryId: string,
    attributes: ListingAttributeInput[]
  ): Promise<void> {
    const metadata = await this.validateAttributeValues(client, categoryId, attributes);
    if (attributes.length === 0) {
      return;
    }

    const values: unknown[] = [];
    const rows = attributes.map((attribute) => {
      const start = values.length;
      const meta = metadata.get(attribute.attributeId)!;
      const coerced = coerceAttributeValue(meta.type, attribute.value, meta.key);
      values.push(listingId, attribute.attributeId, coerced.valueText, coerced.valueNumeric, coerced.valueBoolean);
      return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5})`;
    });

    await client.query(
      `
      INSERT INTO listing_attribute_values (listing_id, attribute_id, value_text, value_numeric, value_boolean)
      VALUES ${rows.join(', ')};
    `,
      values
    );
  }

  private async validateAttributeValues(
    client: Queryable,
    categoryId: string,
    attributes: ListingAttributeInput[]
  ): Promise<Map<string, AttributeMetadataRow>> {
    const attributeIds = [...new Set(attributes.map((attribute) => attribute.attributeId))];
    const metadata = await this.loadAttributeMetadata(client, categoryId, attributeIds);
    const submitted = new Set(attributeIds);

    for (const attributeId of attributeIds) {
      const meta = metadata.get(attributeId);
      if (!meta) {
        throw new NotFoundError('Filter attribute not found');
      }
      if (meta.mapped === null) {
        throw new ValidationError(`Attribute "${meta.key}" is not available for the selected category`);
      }
    }

    for (const meta of metadata.values()) {
      if (meta.required && !submitted.has(meta.id)) {
        throw new ValidationError(`Required attribute "${meta.key}" is missing for the selected category`);
      }
    }

    const duplicate = attributes.find(
      (attribute, index) => attributes.findIndex((candidate) => candidate.attributeId === attribute.attributeId) !== index
    );
    if (duplicate) {
      throw new ValidationError(`Attribute "${duplicate.attributeId}" was provided more than once`);
    }

    const enumValues = new Map<string, Set<string>>();
    const enumAttributeIds = attributes
      .map((attribute) => ({ attribute, type: metadata.get(attribute.attributeId)?.type }))
      .filter((entry): entry is { attribute: ListingAttributeInput; type: FilterAttributeType } => entry.type === 'enum')
      .map((entry) => entry.attribute.attributeId);

    if (enumAttributeIds.length > 0) {
      const options = await client.query<{ attributeId: string; value: string }>(
        `
        SELECT attribute_id as "attributeId", value
        FROM filter_attribute_options
        WHERE attribute_id = ANY($1::uuid[]);
      `,
        [enumAttributeIds]
      );
      for (const option of options.rows) {
        const valuesForAttribute = enumValues.get(option.attributeId) ?? new Set<string>();
        valuesForAttribute.add(option.value);
        enumValues.set(option.attributeId, valuesForAttribute);
      }
    }

    for (const attribute of attributes) {
      const meta = metadata.get(attribute.attributeId)!;
      const coerced = coerceAttributeValue(meta.type, attribute.value, meta.key);
      if (meta.type === 'enum' && !enumValues.get(attribute.attributeId)?.has(coerced.valueText!)) {
        throw new ValidationError(`Value for enum attribute "${meta.key}" is invalid`);
      }
    }

    return metadata;
  }

  private async loadAttributeMetadata(
    client: Queryable,
    categoryId: string,
    attributeIds: string[] | ListingAttributeInput[]
  ): Promise<Map<string, AttributeMetadataRow>> {
    const ids = attributeIds.map((attribute) => (typeof attribute === 'string' ? attribute : attribute.attributeId));
    const result = await client.query<AttributeMetadataRow>(
      `
      SELECT
        fa.id,
        fa.key,
        fa.type,
        cfa.attribute_id as "mapped",
        COALESCE(cfa.required, FALSE) as required
      FROM filter_attributes fa
      LEFT JOIN category_filter_attributes cfa
        ON cfa.attribute_id = fa.id AND cfa.category_id = $2
      WHERE fa.id = ANY($1::uuid[]) OR cfa.category_id = $2;
    `,
      [ids, categoryId]
    );
    return new Map(result.rows.map((attribute) => [attribute.id, attribute]));
  }

  private async loadDetail(client: Queryable, id: string): Promise<ListingDetail | null> {
    const detailRes = await client.query<DetailRow>(
      `
      SELECT
      ${LISTING_BASE_COLUMNS},
        m.name as "modelName",
        m.slug as "modelSlug",
        mk.id as "makeId",
        mk.name as "makeName",
        mk.slug as "makeSlug",
        c.name as "categoryName",
        c.slug as "categorySlug",
        c.parent_id as "categoryParentId"
      FROM listings l
      JOIN models m ON m.id = l.model_id
      JOIN makes mk ON mk.id = m.make_id
      JOIN categories c ON c.id = l.category_id
      WHERE l.id = $1 AND l.status <> 'removed';
    `,
      [id]
    );

    if (detailRes.rows.length === 0) {
      return null;
    }

    const row = detailRes.rows[0];

    const imagesRes = await client.query<ImageRow>(
      `
      SELECT id, image_url as "imageUrl", sort_order as "sortOrder"
      FROM listing_images
      WHERE listing_id = $1
      ORDER BY sort_order ASC, id ASC;
    `,
      [id]
    );

    const attributesRes = await client.query<AttributeRow>(
      `
      SELECT
        lav.attribute_id as "attributeId",
        fa.key,
        fa.type,
        lav.value_text as "valueText",
        lav.value_numeric as "valueNumeric",
        lav.value_boolean as "valueBoolean"
      FROM listing_attribute_values lav
      JOIN filter_attributes fa ON fa.id = lav.attribute_id
      WHERE lav.listing_id = $1
      ORDER BY fa.key ASC;
    `,
      [id]
    );

    const attributes: ListingAttributeValue[] = attributesRes.rows.map((attribute) => ({
      attributeId: attribute.attributeId,
      key: attribute.key,
      type: attribute.type,
      value:
        attribute.type === 'boolean'
          ? attribute.valueBoolean
          : attribute.type === 'range'
            ? attribute.valueNumeric
            : attribute.valueText,
    })) as ListingAttributeValue[];

    const images: ListingImage[] = imagesRes.rows.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      sortOrder: image.sortOrder,
    }));

    return {
      id: row.id,
      modelId: row.modelId,
      categoryId: row.categoryId,
      title: row.title,
      description: row.description,
      year: row.year,
      mileage: row.mileage,
      price: row.price,
      condition: row.condition,
      transmission: row.transmission,
      fuelType: row.fuelType,
      color: row.color,
      city: row.city,
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      model: { id: row.modelId, name: row.modelName, slug: row.modelSlug },
      make: { id: row.makeId, name: row.makeName, slug: row.makeSlug },
      category: {
        id: row.categoryId,
        name: row.categoryName,
        slug: row.categorySlug,
        parentId: row.categoryParentId,
      },
      images,
      attributes,
    };
  }
}

async function assertModelExists(client: Queryable, modelId: string): Promise<void> {
  const result = await client.query('SELECT id FROM models WHERE id = $1', [modelId]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Model not found');
  }
}

async function assertCategoryExists(client: Queryable, categoryId: string): Promise<void> {
  const result = await client.query('SELECT id FROM categories WHERE id = $1', [categoryId]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Category not found');
  }
}

function mapRepositoryError(error: any): Error {
  if (error instanceof AppError) {
    return error;
  }
  if (error.code === '23505') {
    return new ConflictError('Listing conflicts with existing data');
  }
  if (error.code === '23503') {
    return new ValidationError('Referenced model or category does not exist');
  }
  return error;
}
