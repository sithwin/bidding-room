import { Db } from './db';

export interface ValuationEnquiry {
  category: string;
  artistMaker: string | null;
  description: string;
  photoKeys: string[];
  name: string;
  email: string;
}

export type EnquiryStatus = 'NEW' | 'RESPONDED' | 'CLOSED';

export interface StoredValuationEnquiry extends ValuationEnquiry {
  id: string;
  status: EnquiryStatus;
  createdAt: Date;
}

interface EnquiryRow {
  id: string;
  category: string;
  artist_maker: string | null;
  description: string;
  photo_keys: string[];
  name: string;
  email: string;
  status: EnquiryStatus;
  created_at: Date;
}

function mapEnquiryRow(row: EnquiryRow): StoredValuationEnquiry {
  return {
    id: row.id,
    category: row.category,
    artistMaker: row.artist_maker,
    description: row.description,
    photoKeys: row.photo_keys,
    name: row.name,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
  };
}

export class PostgresEnquiryRepository {
  constructor(private readonly db: Db) {}

  async save(enquiry: ValuationEnquiry): Promise<void> {
    await this.db`
      INSERT INTO valuation_enquiries (category, artist_maker, description, photo_keys, name, email)
      VALUES (
        ${enquiry.category},
        ${enquiry.artistMaker},
        ${enquiry.description},
        ${enquiry.photoKeys},
        ${enquiry.name},
        ${enquiry.email}
      )
    `;
  }

  async findAll(filter: { status?: string }): Promise<StoredValuationEnquiry[]> {
    const rows = filter.status
      ? await this.db<EnquiryRow[]>`SELECT * FROM valuation_enquiries WHERE status = ${filter.status} ORDER BY created_at DESC`
      : await this.db<EnquiryRow[]>`SELECT * FROM valuation_enquiries ORDER BY created_at DESC`;
    return rows.map(mapEnquiryRow);
  }

  async updateStatus(id: string, status: EnquiryStatus): Promise<boolean> {
    const rows = await this.db`
      UPDATE valuation_enquiries SET status = ${status} WHERE id = ${id} RETURNING id
    `;
    return rows.length > 0;
  }
}
