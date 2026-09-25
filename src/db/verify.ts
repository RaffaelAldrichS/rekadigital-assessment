import { pool } from './pool';

async function verify() {
  console.log('--- Verification Queries ---');

  const runExplain = async (label: string, query: string, values: any[] = []) => {
    console.log(`\n=== ${label} ===`);
    const res = await pool.query(`EXPLAIN (ANALYZE, BUFFERS) ${query}`, values);
    console.log(res.rows.map(r => r['QUERY PLAN']).join('\n'));
  };

  // 1. Default Listing Cursor Query (Created At)
  await runExplain('Default Listing Cursor Query', `
    SELECT * FROM listings l
    JOIN models m ON m.id = l.model_id
    JOIN makes mk ON mk.id = m.make_id
    WHERE l.status <> 'removed'
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT 20
  `);

  // 2. Category Subtree + Cursor
  const catRes = await pool.query('SELECT id FROM categories LIMIT 1');
  if (catRes.rows.length) {
    const catId = catRes.rows[0].id;
    await runExplain('Category Subtree + Cursor', `
      SELECT l.id FROM listings l
      JOIN category_closure cc ON cc.ancestor_id = $1 AND cc.descendant_id = l.category_id
      WHERE l.status <> 'removed'
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT 20
    `, [catId]);
  }

  // 3. Dynamic Filter Query
  const attrRes = await pool.query('SELECT id FROM filter_attributes LIMIT 1');
  if (attrRes.rows.length) {
    const attrId = attrRes.rows[0].id;
    await runExplain('Dynamic Filter Query', `
      SELECT l.id FROM listings l
      WHERE EXISTS (
        SELECT 1 FROM listing_attribute_values lav 
        WHERE lav.listing_id = l.id AND lav.attribute_id = $1 AND lav.value_text = 'automatic'
      ) AND l.status <> 'removed'
      LIMIT 20
    `, [attrId]);
  }

  // 4. Full-text Search
  await runExplain('Full-text Search', `
    SELECT id FROM listings l
    WHERE search_vector @@ websearch_to_tsquery('english', 'Toyota')
    AND l.status <> 'removed'
    LIMIT 20
  `);

  // 5. Combined Search + Filter
  await runExplain('Combined Search + Filter', `
    SELECT l.id FROM listings l
    JOIN models m ON m.id = l.model_id
    JOIN makes mk ON mk.id = m.make_id
    WHERE search_vector @@ websearch_to_tsquery('english', 'Toyota')
    AND l.price >= 100000000 AND l.price <= 200000000
    AND l.status <> 'removed'
    LIMIT 20
  `);

  // 6. Facets
  await runExplain('Facets Query', `
    SELECT 'total' as key, COUNT(*) as count FROM listings l WHERE l.status <> 'removed'
    UNION ALL
    SELECT mk.slug, COUNT(*) FROM listings l
    JOIN models m ON m.id = l.model_id
    JOIN makes mk ON mk.id = m.make_id
    WHERE l.status <> 'removed'
    GROUP BY mk.slug
  `);

  await pool.end();
  process.exit(0);
}

verify();
