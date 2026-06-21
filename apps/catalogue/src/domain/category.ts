interface CategoryProps {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  displayOrder: number;
}

export class Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  readonly displayOrder: number;

  constructor(props: CategoryProps) {
    this.id = props.id;
    this.name = props.name;
    this.slug = props.slug;
    this.parentId = props.parentId;
    this.displayOrder = props.displayOrder;
  }
}
