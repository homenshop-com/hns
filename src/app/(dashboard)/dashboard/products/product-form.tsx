"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import ImageUpload from "@/components/ImageUpload";

interface CategoryOption {
  id: string;
  category: string;
  parent: string;
  depth: string;
}

interface ProductImage {
  original: string;
  thumb: string;
  medium: string;
  large: string;
}

interface ProductFormData {
  name: string;
  description: string;
  price: string;
  salePrice: string;
  stock: string;
  category: string;
  status: string;
  images: string[];
  /** Full image variant data for new uploads */
  imageVariants: ProductImage[];
}

interface ProductFormProps {
  initialData?: ProductFormData;
  productId?: string;
  mode: "create" | "edit";
  /** When a reseller manages a customer site, scope all reads/writes to it. */
  siteId?: string;
}

export default function ProductForm({
  initialData,
  productId,
  mode,
  siteId,
}: ProductFormProps) {
  const router = useRouter();
  const tp = useTranslations("productsDash");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState<ProductFormData>(
    initialData ?? {
      name: "",
      description: "",
      price: "",
      salePrice: "",
      stock: "0",
      category: "",
      status: "ACTIVE",
      images: [],
      imageVariants: [],
    }
  );

  const [categories, setCategories] = useState<CategoryOption[]>([]);

  useEffect(() => {
    fetch(`/api/product-categories${siteId ? `?siteId=${siteId}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.categories) setCategories(data.categories);
      })
      .catch(() => {});
  }, [siteId]);

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const url =
      mode === "create" ? "/api/products" : `/api/products/${productId}`;
    const method = mode === "create" ? "POST" : "PUT";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          price: Number(formData.price),
          salePrice: formData.salePrice
            ? Number(formData.salePrice)
            : null,
          stock: Number(formData.stock),
          category: formData.category,
          status: formData.status,
          images: formData.images.length > 0 ? formData.images : null,
          imageVariants: formData.imageVariants.length > 0 ? formData.imageVariants : null,
          ...(siteId ? { siteId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || tp("genericError"));
      }

      router.push(`/dashboard/products${siteId ? `?siteId=${siteId}` : ""}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tp("genericError"));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">{tp("productImages")}</label>
        {formData.images.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-3">
            {formData.images.map((url, i) => (
              <div key={i} className="relative group">
                <img
                  src={url}
                  alt={tp("productImageAlt", { index: i + 1 })}
                  className="w-24 h-24 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700"
                />
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      images: prev.images.filter((_, idx) => idx !== i),
                    }))
                  }
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
        <ImageUpload
          value=""
          onChange={(url) =>
            setFormData((prev) => ({ ...prev, images: [...prev.images, url] }))
          }
          onUploadComplete={(urls) =>
            setFormData((prev) => ({
              ...prev,
              imageVariants: [...prev.imageVariants, urls],
            }))
          }
          folder="products"
          resize
        />
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">
          {tp("fieldName")} <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={formData.name}
          onChange={handleChange}
          className={inputClass}
          placeholder={tp("namePlaceholder")}
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium mb-1"
        >
          {tp("fieldDescription")}
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          value={formData.description}
          onChange={handleChange}
          className={inputClass}
          placeholder={tp("descriptionPlaceholder")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="price" className="block text-sm font-medium mb-1">
            {tp("fieldPrice")}
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min="0"
            value={formData.price}
            onChange={handleChange}
            className={inputClass}
            placeholder="0"
          />
        </div>

        <div>
          <label
            htmlFor="salePrice"
            className="block text-sm font-medium mb-1"
          >
            {tp("fieldSalePrice")}
          </label>
          <input
            id="salePrice"
            name="salePrice"
            type="number"
            min="0"
            value={formData.salePrice}
            onChange={handleChange}
            className={inputClass}
            placeholder={tp("salePricePlaceholder")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="stock" className="block text-sm font-medium mb-1">
            {tp("fieldStock")}
          </label>
          <input
            id="stock"
            name="stock"
            type="number"
            min="0"
            value={formData.stock}
            onChange={handleChange}
            className={inputClass}
            placeholder="0"
          />
        </div>

        <div>
          <label
            htmlFor="category"
            className="block text-sm font-medium mb-1"
          >
            {tp("fieldCategory")}
          </label>
          <select
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className={inputClass}
          >
            <option value="">{tp("categoryNone")}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.depth !== "0" && cat.parent !== "0" ? "└ " : ""}
                {cat.category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium mb-1">
          {tp("fieldStatus")}
        </label>
        <select
          id="status"
          name="status"
          value={formData.status}
          onChange={handleChange}
          className={inputClass}
        >
          <option value="ACTIVE">{tp("statusActive")}</option>
          <option value="HIDDEN">{tp("statusHidden")}</option>
          <option value="SOLDOUT">{tp("statusSoldout")}</option>
        </select>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#3182f6] px-6 h-11 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(49,130,246,0.25),0_2px_6px_rgba(49,130,246,0.18)] transition hover:bg-[#1b64da] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <><i className="fa-solid fa-spinner fa-spin" />{tp("saving")}</>
          ) : mode === "create" ? (
            <><i className="fa-solid fa-plus" />{tp("addProduct")}</>
          ) : (
            <><i className="fa-solid fa-floppy-disk" />{tp("editProduct")}</>
          )}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {tp("cancel")}
        </button>
      </div>
    </form>
  );
}
