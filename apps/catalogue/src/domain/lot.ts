export enum LotCondition {
  New = 'NEW',
  Excellent = 'EXCELLENT',
  VeryGood = 'VERY_GOOD',
  Good = 'GOOD',
}

export interface LotImage {
  id: string;
  lotId: string;
  url: string;
  thumbnailUrl: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface LotProps {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  condition: LotCondition | null;
  estimatedValue: number | null;
  images: LotImage[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Lot {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly categoryId: string | null;
  readonly condition: LotCondition | null;
  readonly estimatedValue: number | null;
  readonly images: LotImage[];
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: LotProps) {
    this.id = props.id;
    this.title = props.title;
    this.description = props.description;
    this.categoryId = props.categoryId;
    this.condition = props.condition;
    this.estimatedValue = props.estimatedValue;
    this.images = props.images;
    this.createdBy = props.createdBy;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  primaryImage(): LotImage | null {
    const primary = this.images.find(img => img.isPrimary);
    return primary ?? this.images[0] ?? null;
  }

  sortedImages(): LotImage[] {
    return [...this.images].sort((a, b) => a.displayOrder - b.displayOrder);
  }
}
