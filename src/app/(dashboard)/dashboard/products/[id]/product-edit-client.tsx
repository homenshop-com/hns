"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProductForm from "../product-form";

interface ProductImage {
  original: string;
  thumb: string;
  medium: string;
  large: string;
}

interface ProductEditClientProps {
  productId: string;
  initialData: {
    name: string;
    description: string;
    price: string;
    salePrice: string;
    stock: string;
    category: string;
    status: string;
    images: string[];
    imageVariants: ProductImage[];
  };
}

export default function ProductEditClient({
  productId,
  initialData,
}: ProductEditClientProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/dashboard/products");
        router.refresh();
      }
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div>
      <ProductForm
        mode="edit"
        productId={productId}
        initialData={initialData}
      />

      <div className="mt-10 max-w-2xl border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
          위험 영역
        </h3>
        {!showConfirm ? (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            상품 삭제
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              정말 삭제하시겠습니까?
            </p>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "삭제 중..." : "삭제 확인"}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              취소
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
