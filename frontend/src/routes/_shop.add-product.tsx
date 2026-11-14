import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/shop/bits";
import { ProductForm } from "@/components/shop/ProductForm";
import { useData } from "@/lib/store";

export const Route = createFileRoute("/_shop/add-product")({
  head: () => ({ meta: [{ title: "Add product — StockWise" }, { name: "description", content: "Add a product with variations, prices and stock." }] }),
  component: () => <RequirePerm perm="manageProducts"><AddProduct /></RequirePerm>,
});

function AddProduct() {
  const data = useData();
  return (
    <>
      <PageHeader title="Add product" subtitle="Create a product with its variations and opening stock." />
      {data.categories.length === 0 ? (
        <EmptyState title="Create a category first" text="Products belong to a category like Shoes or Perfumes."
          action={<Button asChild><Link to="/categories">Go to categories</Link></Button>} />
      ) : <ProductForm />}
    </>
  );
}
