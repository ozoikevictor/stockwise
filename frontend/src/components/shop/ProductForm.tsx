import { useNavigate } from "@tanstack/react-router";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "./Field";
import { Panel } from "./bits";
import { actions, useData } from "@/lib/store";
import type { Product } from "@/lib/types";

const money = z.coerce.number({ invalid_type_error: "Enter an amount" }).min(0, "Cannot be negative");
const schema = z.object({
  name: z.string().trim().min(2, "Product name is required"),
  categoryId: z.string().min(1, "Choose a category"),
  brand: z.string().trim().optional().default(""),
  description: z.string().trim().optional().default(""),
  sku: z.string().trim().min(2, "SKU is required"),
  supplier: z.string().trim().optional().default(""),
  model: z.string().trim().optional().default(""),
  barcode: z.string().trim().optional().default(""),
  lowStockThreshold: z.coerce.number().int("Whole number").min(0),
  image: z.string().optional().default(""),
  variants: z.array(z.object({
    id: z.string(),
    label: z.string().trim().min(1, "Name this variation"),
    sku: z.string().trim().min(1, "SKU required"),
    costPrice: money,
    sellingPrice: money,
    quantity: z.coerce.number().int("Whole number").min(0, "Cannot be negative"),
  })).min(1, "Add at least one variation"),
}).superRefine((d, ctx) => {
  const skus = new Set<string>();
  d.variants.forEach((v, i) => {
    if (skus.has(v.sku.toLowerCase())) ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: "Duplicate SKU" });
    skus.add(v.sku.toLowerCase());
  });
});
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
  const scale = Math.min(1, 400 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = img.width * scale; c.height = img.height * scale;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.8);
}

export function ProductForm({ product }: { product?: Product }) {
  const data = useData();
  const nav = useNavigate();
  const [newCat, setNewCat] = useState("");
  const { register, control, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: product ? { ...product } : {
      name: "", categoryId: data.categories[0]?.id ?? "", brand: "", description: "", sku: "", supplier: "", model: "", barcode: "", lowStockThreshold: 5, image: "",
      variants: [{ id: "", label: "Standard", sku: "", costPrice: "" as unknown as number, sellingPrice: "" as unknown as number, quantity: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "variants" });
  const image = watch("image");
  const sku = watch("sku");
  const categoryId = watch("categoryId");

  const onSubmit = handleSubmit((d) => {
    const saved = actions.saveProduct({ ...d, id: product?.id });
    toast.success(product ? "Product updated" : "Product added");
    nav({ to: "/product/$id", params: { id: saved.id } });
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3" noValidate>
      <div className="space-y-6 lg:col-span-2">
        <Panel title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Product name" error={errors.name?.message}><Input {...register("name")} placeholder="Nike Air Force 1" /></Field></div>
            <Field label="Brand"><Input {...register("brand")} placeholder="Nike" /></Field>
            <Field label="SKU / product code" error={errors.sku?.message}><Input {...register("sku")} placeholder="NIK-AF1" /></Field>
            <Field label="Category" error={errors.categoryId?.message}>
              <Select value={categoryId} onValueChange={(v) => setValue("categoryId", v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
                <SelectContent>{data.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Or create a category">
              <div className="flex gap-2">
                <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Sunglasses" />
                <Button type="button" variant="outline" onClick={() => {
                  try { const c = actions.addCategory(newCat); setValue("categoryId", c.id, { shouldValidate: true }); setNewCat(""); toast.success("Category added"); }
                  catch (e) { toast.error((e as Error).message); }
                }}>Add</Button>
              </div>
            </Field>
            <Field label="Model / design (optional)"><Input {...register("model")} placeholder="Low '07" /></Field>
            <Field label="Barcode (optional)"><Input {...register("barcode")} placeholder="Scan or type" /></Field>
            <Field label="Supplier (optional)"><Input {...register("supplier")} placeholder="Computer Village Ikeja" /></Field>
            <Field label="Low stock threshold" error={errors.lowStockThreshold?.message} hint="Warn when total stock is at or below this">
              <Input type="number" min={0} {...register("lowStockThreshold")} />
            </Field>
            <div className="sm:col-span-2"><Field label="Description"><Textarea rows={3} {...register("description")} /></Field></div>
          </div>
        </Panel>

        <Panel title="Variations, prices & stock" action={
          <Button type="button" variant="outline" size="sm" onClick={() => append({ id: "", label: "", sku: `${sku || "SKU"}-${fields.length + 1}`, costPrice: 0, sellingPrice: 0, quantity: 0 })}>
            <Plus /> Add variation
          </Button>}>
          <p className="mb-4 text-xs text-muted-foreground">Size, colour, design or model — each with its own SKU and stock.{product && " Change stock for existing variations with Restock so it's recorded in history."}</p>
          <div className="space-y-3">
            {fields.map((f, i) => {
              const e = errors.variants?.[i];
              const existing = product?.variants.some((v) => v.id === f.id && f.id);
              return (
                <div key={f.id + i} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-12 sm:items-start">
                  <div className="sm:col-span-3"><Field label="Variation" error={e?.label?.message}><Input {...register(`variants.${i}.label`)} placeholder="White / 42" /></Field></div>
                  <div className="sm:col-span-2"><Field label="SKU" error={e?.sku?.message}><Input {...register(`variants.${i}.sku`)} /></Field></div>
                  <div className="sm:col-span-2"><Field label="Cost ₦" error={e?.costPrice?.message}><Input type="number" min={0} {...register(`variants.${i}.costPrice`)} /></Field></div>
                  <div className="sm:col-span-2"><Field label="Selling ₦" error={e?.sellingPrice?.message}><Input type="number" min={0} {...register(`variants.${i}.sellingPrice`)} /></Field></div>
                  <div className="sm:col-span-2"><Field label="Quantity" error={e?.quantity?.message}><Input type="number" min={0} disabled={existing} {...register(`variants.${i}.quantity`)} /></Field></div>
                  <div className="flex sm:col-span-1 sm:justify-end sm:pt-6">
                    <Button type="button" variant="ghost" size="icon" disabled={fields.length === 1} onClick={() => remove(i)} aria-label="Remove variation"><Trash2 /></Button>
                  </div>
                </div>
              );
            })}
          </div>
          {errors.variants?.root?.message && <p className="mt-2 text-xs text-destructive">{errors.variants.root.message}</p>}
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel title="Product image">
          {image ? (
            <div className="relative">
              <img src={image} alt="Product" className="aspect-square w-full rounded-xl object-cover" />
              <Button type="button" size="icon" variant="secondary" className="absolute right-2 top-2" onClick={() => setValue("image", "")} aria-label="Remove image"><X /></Button>
            </div>
          ) : (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:bg-muted">
              <ImagePlus /> Upload image
              <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) { try { setValue("image", await compressImage(f)); } catch { toast.error("Could not read that image"); } }
              }} />
            </label>
          )}
        </Panel>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => history.back()}>Cancel</Button>
          <Button type="submit" className="flex-1">{product ? "Save changes" : "Add product"}</Button>
        </div>
      </div>
    </form>
  );
}
