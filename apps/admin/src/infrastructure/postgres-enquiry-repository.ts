import { Db } from './db';

export interface ValuationEnquiry {
  category: string;
  artistMaker: string | null;
  description: string;
  photoKeys: string[];
  name: string;
  email: string;
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
}
