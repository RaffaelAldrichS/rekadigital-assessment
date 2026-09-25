import { pool } from './pool';
import { randomUUID } from 'node:crypto';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Truncating tables...');
    await client.query(`
      TRUNCATE TABLE listing_attribute_values,
                     filter_attribute_options,
                     category_filter_attributes,
                     filter_attributes,
                     listing_images,
                     listings,
                     models,
                     makes,
                     category_closure,
                     categories
      RESTART IDENTITY CASCADE;
    `);

    // 1. Seed Makes & Models
    const makes = ['Toyota', 'Honda', 'Yamaha'];
    const modelsByMake: Record<string, string[]> = {
      Toyota: ['Camry', 'Fortuner', 'Alphard', 'Avanza'],
      Honda: ['Civic', 'CR-V', 'City', 'HR-V'],
      Yamaha: ['NMAX', 'Aerox', 'R15', 'MT-15'],
    };

    const makeIds: Record<string, string> = {};
    for (const makeName of makes) {
      const res = await client.query(
        'INSERT INTO makes (name, slug) VALUES ($1, $2) RETURNING id',
        [makeName, makeName.toLowerCase()]
      );
      makeIds[makeName] = res.rows[0].id;
    }

    const modelIds: string[] = [];
    for (const [makeName, models] of Object.entries(modelsByMake)) {
      for (const modelName of models) {
        const res = await client.query(
          'INSERT INTO models (make_id, name, slug) VALUES ($1, $2, $3) RETURNING id',
          [makeIds[makeName], modelName, modelName.toLowerCase()]
        );
        modelIds.push(res.rows[0].id);
      }
    }

    // 2. Seed Categories & Closure
    const createCategory = async (name: string, slug: string, parentId: string | null = null): Promise<string> => {
      const res = await client.query(
        'INSERT INTO categories (name, slug, parent_id) VALUES ($1, $2, $3) RETURNING id',
        [name, slug, parentId]
      );
      const id = res.rows[0].id;
      await client.query('INSERT INTO category_closure (ancestor_id, descendant_id, depth) VALUES ($1, $1, 0)', [id]);
      if (parentId) {
        await client.query(`
          INSERT INTO category_closure (ancestor_id, descendant_id, depth)
          SELECT ancestor_id, $1, depth + 1 FROM category_closure WHERE descendant_id = $2
        `, [id, parentId]);
      }
      return id;
    };

    const carsId = await createCategory('Cars', 'cars');
    const suvId = await createCategory('SUV', 'suv', carsId);
    const sedanId = await createCategory('Sedan', 'sedan', carsId);
    
    const motoId = await createCategory('Motorcycles', 'motorcycles');
    const scooterId = await createCategory('Scooter', 'scooter', motoId);

    const categoryIds = [suvId, sedanId, scooterId];

    // 3. Seed Filters
    const filterRes = await client.query(
      'INSERT INTO filter_attributes (key, name, type) VALUES ($1, $2, $3) RETURNING id',
      ['transmission', 'Transmission', 'enum']
    );
    const transAttrId = filterRes.rows[0].id;
    await client.query('INSERT INTO filter_attribute_options (attribute_id, value, label) VALUES ($1, $2, $3), ($1, $4, $5)', 
      [transAttrId, 'automatic', 'Automatic', 'manual', 'Manual']);

    for (const catId of categoryIds) {
      await client.query('INSERT INTO category_filter_attributes (category_id, attribute_id) VALUES ($1, $2)', [catId, transAttrId]);
    }

    // 4. Seed 500+ Listings
    console.log('Seeding listings...');
    const statuses = ['available', 'pending', 'sold'];
    const transmissions = ['automatic', 'manual'];
    const cities = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Bali'];

    for (let i = 0; i < 550; i++) {
      const modelId = modelIds[Math.floor(Math.random() * modelIds.length)];
      const categoryId = categoryIds[Math.floor(Math.random() * categoryIds.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const trans = transmissions[Math.floor(Math.random() * transmissions.length)];
      const price = Math.floor(Math.random() * 500000000) + 100000000;

      const res = await client.query(`
        INSERT INTO listings (
          model_id, category_id, title, year, mileage, price,
          condition, transmission, fuel_type, color, city, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [modelId, categoryId, `Test Listing ${i}`, 2010 + (i % 15), i * 100, price, 'used', trans, 'petrol', 'white', cities[i % 5], status]);

      const listingId = res.rows[0].id;
      await client.query('INSERT INTO listing_attribute_values (listing_id, attribute_id, value_text) VALUES ($1, $2, $3)',
        [listingId, transAttrId, trans]);
    }

    await client.query('COMMIT');
    console.log('Seeding complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
