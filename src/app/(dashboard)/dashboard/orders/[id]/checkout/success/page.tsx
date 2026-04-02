"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function PaymentSuccessPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function confirmPayment() {
      const paymentKey = searchParams.get("paymentKey");
      const tossOrderId = searchParams.get("orderId");
      const amount = searchParams.get("amount");

      if (!paymentKey || !tossOrderId || !amount) {
        setStatus("error");
        setErrorMessage("결제 정보가 올바르지 않습니다.");
        return;
      }

      try {
        const res = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentKey,
            orderId: tossOrderId,
            amount: Number(amount),
          }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMessage(data.error || "결제 승인에 실패했습니다.");
        }
      } catch {
        setStatus("error");
        setErrorMessage("결제 처리 중 오류가 발생했습니다.");
      }
    }

    confirmPayment();
  }, [searchParams]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-4xl">...</div>
          <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300">
            결제를 확인하고 있습니다...
          </p>
          <p className="mt-2 text-sm text-zinc-500">잠시만 기다려 주세요.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-6">
          <div className="rounded-xl border border-red-200 bg-white p-8 text-center dark:border-red-800 dark:bg-zinc-900">
            <div className="mb-4 text-4xl">!</div>
            <h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">
              결제 실패
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              {errorMessage}
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href={`/dashboard/orders/${orderId}/checkout`}
                className="block w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors text-center"
              >
                다시 결제하기
              </Link>
              <Link
                href={`/dashboard/orders/${orderId}`}
                className="block w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors text-center"
              >
                주문 상세로 돌아가기
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="max-w-md w-full mx-auto px-6">
        <div className="rounded-xl border border-green-200 bg-white p-8 text-center dark:border-green-800 dark:bg-zinc-900">
          <div className="mb-4 text-4xl text-green-600">&#10003;</div>
          <h2 className="text-xl font-bold text-green-700 dark:text-green-400 mb-2">
            결제가 완료되었습니다
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
            주문이 정상적으로 처리되었습니다.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href={`/dashboard/orders/${orderId}`}
              className="block w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors text-center"
            >
              주문 상세 보기
            </Link>
            <Link
              href="/dashboard/orders"
              className="block w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors text-center"
            >
              주문 목록으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
