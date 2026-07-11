import { Hono } from 'hono';
import { FacetFilters, FacetRepository } from '../domain/facet-repository';

interface Deps {
  facetRepository: FacetRepository;
}

export function buildFacetsRouter(deps: Deps): Hono {
  const router = new Hono();

  router.get('/api/lots/facets', async c => {
    const { q, auctionId, minPrice, maxPrice } = c.req.query();

    const filters: FacetFilters = {
      query: q || undefined,
      auctionId: auctionId || undefined,
      minEstimatedValue: minPrice ? Number(minPrice) : undefined,
      maxEstimatedValue: maxPrice ? Number(maxPrice) : undefined,
    };

    const [departments, auctions] = await Promise.all([
      deps.facetRepository.countLotsByDepartment(filters),
      deps.facetRepository.listOpenAuctions(),
    ]);

    return c.json({ departments, auctions });
  });

  return router;
}
