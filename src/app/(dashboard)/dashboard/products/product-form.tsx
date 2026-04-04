"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
}

export default function ProductForm({
  initialData,
  productId,
  mode,
}: ProductFormProps) {
  const router = useRouter();
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
    fetch("/api/product-categories")
      .then((r) => r.json())
      .then((data) => {
        if (data.categories) setCategories(data.categories);
      })
      .catch(() => {});
  }, []);

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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "오류가 발생했습니다.");
      }

      router.push("/dashboard/products");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
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
        <label className="block text-sm font-medium mb-1">상품 이미지</label>
        {formData.images.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-3">
            {formData.images.map((url, i) => (
              <div key={i} className="relative group">
                <img
                  src={url}
                  alt={`상품 이미지 ${i + 1}`}
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
          상품명 <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={formData.name}
          onChange={handleChange}
          className={inputClass}
          placeholder="상품명을 입력하세요"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium mb-1"
        >
          상품 설명
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          value={formData.description}
          onChange={handleChange}
          className={inputClass}
          placeholder="상품에 대한 설명을 입력하세요"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="price" className="block text-sm font-medium mb-1">
            판매가 (원)
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
            할인가 (원)
          </label>
          <input
            id="salePrice"
            name="salePrice"
            type="number"
            min="0"
            value={formData.salePrice}
            onChange={handleChange}
            className={inputClass}
            placeholder="할인가 (선택사항)"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="stock" className="block text-sm font-medium mb-1">
            재고 수량
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
            카테고리
          </label>
          <select
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className={inputClass}
          >
            <option value="">선택 안함</option>
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
          상태
        </label>
        <select
          id="status"
          name="status"
          value={formData.status}
          onChange={handleChange}
          className={inputClass}
        >
          <option value="ACTIVE">판매중</option>
          <option value="HIDDEN">숨김</option>
          <option value="SOLDOUT">품절</option>
        </select>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading
            ? "저장 중..."
            : mode === "create"
              ? "상품 등록"
              : "상품 수정"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          취소
        </button>
      </div>
    </form>
  );
}
