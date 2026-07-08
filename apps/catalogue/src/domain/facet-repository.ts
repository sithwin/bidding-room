export interface FacetFilters {
  query?: string;
  auctionId?: string;
  minEstimatedValue?: number;
  maxEstimatedValue?: number;
}

export interface DepartmentFacet {
  name: string;
  count: number;
}

export interface AuctionFacet {
  id: string;
  title: string;
}

export interface FacetRepository {
  countLotsByDepartment(filters: FacetFilters): Promise<DepartmentFacet[]>;
  listOpenAuctions(): Promise<AuctionFacet[]>;
}
