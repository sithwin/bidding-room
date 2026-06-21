import { Lot, LotCondition, LotImage } from '../domain/lot';
import { LotFilters, LotRepository, PaginatedResult } from '../domain/lot-repository';
import { Db } from './db';

interface LotRow {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  condition: string | null;
  estimated_value: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface LotImageRow {
  id: string;
  lot_id: string;
  url: string;
  thumbnail_url: string;
  display_order: number;
  is_primary: boolean;
}

function rowToLotImage(row: LotImageRow): LotImage {
  return {
    id: row.id,
    lotId: row.lot_id,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    displayOrder: row.display_order,
    isPrimary: row.is_primary,
  };
}

async function fetchImages(db: Db, lotId: string): Promise<LotImage[]> {
  const rows = await db<LotImageRow[]>`
    SELECT id, lot_id, url, thumbnail_url, display_order, is_primary
    FROM lot_images WHERE lot_id = ${lotId}
    ORDER BY display_order ASC
  `;
  return rows.map(rowToLotImage);
}

function rowToLot(row: LotRow, images: LotImage[]): Lot {
  return new Lot({
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    condition: row.condition as LotCondition | null,
    estimatedValue: row.estimated_value !== null ? Number(row.estimated_value) : null,
    images,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PostgresLotRepository implements LotRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Lot | null> {
    const rows = await this.db<LotRow[]>`
      SELECT id, title, description, category_id, condition, estimated_value, created_by, created_at, updated_at
      FROM lots WHERE id = ${id}
    `;
    if (rows.length === 0) {
      return null;
    }
    const images = await fetchImages(this.db, id);
    return rowToLot(rows[0], images);
  }

  async findAll(filters: LotFilters, limit: number, offset: number): Promise<PaginatedResult<Lot>> {
    const conditions: string[] = [];
    const values: (string | number | null)[] = [];
    let paramIndex = 1;

    if (filters.categoryId) {
      conditions.push(`category_id = $${paramIndex++}`);
      values.push(filters.categoryId);
    }
    if (filters.condition) {
      conditions.push(`condition = $${paramIndex++}`);
      values.push(filters.condition);
    }
    if (filters.minEstimatedValue !== undefined) {
      conditions.push(`estimated_value >= $${paramIndex++}`);
      values.push(filters.minEstimatedValue);
    }
    if (filters.maxEstimatedValue !== undefined) {
      conditions.push(`estimated_value <= $${paramIndex++}`);
      values.push(filters.maxEstimatedValue);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.db.unsafe<{ count: string }[]>(
      `SELECT COUNT(*) as count FROM lots ${where}`,
      values,
    );
    const total = Number(countRows[0].count);

    const rows = await this.db.unsafe<LotRow[]>(
      `SELECT id, title, description, category_id, condition, estimated_value, created_by, created_at, updated_at
       FROM lots ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset],
    );

    if (rows.length === 0) {
      return { items: [], total, limit, offset };
    }

    const lotIds = rows.map(row => row.id);
    const imageRows = await this.db<LotImageRow[]>`
      SELECT id, lot_id, url, thumbnail_url, display_order, is_primary
      FROM lot_images WHERE lot_id IN ${this.db(lotIds)}
      ORDER BY lot_id, display_order ASC
    `;

    const imagesByLotId = new Map<string, LotImage[]>();
    for (const img of imageRows) {
      const arr = imagesByLotId.get(img.lot_id) ?? [];
      arr.push(rowToLotImage(img));
      imagesByLotId.set(img.lot_id, arr);
    }

    const lots = rows.map(row => rowToLot(row, imagesByLotId.get(row.id) ?? []));
    return { items: lots, total, limit, offset };
  }

  async save(lot: Lot): Promise<void> {
    await this.db`
      INSERT INTO lots (id, title, description, category_id, condition, estimated_value, created_by, created_at, updated_at)
      VALUES (
        ${lot.id}, ${lot.title}, ${lot.description}, ${lot.categoryId},
        ${lot.condition}, ${lot.estimatedValue}, ${lot.createdBy},
        ${lot.createdAt}, ${lot.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        category_id = EXCLUDED.category_id,
        condition = EXCLUDED.condition,
        estimated_value = EXCLUDED.estimated_value,
        updated_at = EXCLUDED.updated_at
    `;

    await this.db.begin(async sql => {
      await sql`DELETE FROM lot_images WHERE lot_id = ${lot.id}`;
      for (const img of lot.images) {
        await sql`
          INSERT INTO lot_images (id, lot_id, url, thumbnail_url, display_order, is_primary)
          VALUES (${img.id}, ${img.lotId}, ${img.url}, ${img.thumbnailUrl}, ${img.displayOrder}, ${img.isPrimary})
        `;
      }
    });
  }
}
