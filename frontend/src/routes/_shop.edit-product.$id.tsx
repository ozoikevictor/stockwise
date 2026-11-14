import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/shop/bits";
import { ProductForm } from "@/components/shop/ProductForm";
import { useData } from "@/lib/store";

export const Route = createFileRoute("/_shop/edit-product/$id")({
  head: () => ({ meta: [{ title: "Edit product — StockWise" }, { name: "description", content: "Edit product details and variations." }] }),
  component: () => <RequirePerm perm="manageProducts"><EditProduct /></RequirePerm>,
});

function EditProduct() {
  const { id } = Route.useParams();
  const p = useData().products.find((x) => x.id === id);
  if (!p) return <EmptyState title="Product not found" action={<Button asChild><Link to="/products">Back to products</Link></Button>} />;
  return (
    <>
      <PageHeader title={`Edit ${p.name}`} />
      <ProductForm key={p.id} product={p} />
    </>
  );
}
