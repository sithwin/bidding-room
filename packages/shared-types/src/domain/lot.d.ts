export type LotCondition = 'NEW' | 'EXCELLENT' | 'VERY_GOOD' | 'GOOD';
export interface LotImage {
    id: string;
    url: string;
    thumbnailUrl: string;
    displayOrder: number;
    isPrimary: boolean;
}
export interface Lot {
    id: string;
    title: string;
    description: string | null;
    categoryId: string;
    condition: LotCondition | null;
    estimatedValue: number | null;
    images: LotImage[];
    createdAt: string;
    updatedAt: string;
}
//# sourceMappingURL=lot.d.ts.map