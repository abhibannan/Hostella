import { useMemo } from "react";

type Payment = {
  status?: string;
  amount?: number | string;
  submittedAt?: string;
  paymentDate?: string;
  createdAt?: string;
};

export interface PaymentStats {
  submitted: number;
  approved: number;
  rejected: number;
  pendingProofsCount: number;
  recentPayments: Payment[];
  monthlyPaymentBars: { key: string; label: string; value: number }[];
}

export function usePaymentStats(payments: Payment[]): PaymentStats {
  const submitted = useMemo(
    () => payments.filter((p) => {
      const s = String(p.status || "APPROVED").toUpperCase();
      return s === "SUBMITTED" || s === "PENDING";
    }).length,
    [payments],
  );

  const approved = useMemo(
    () => payments.filter((p) => String(p.status || "APPROVED").toUpperCase() === "APPROVED").length,
    [payments],
  );

  const rejected = useMemo(
    () => payments.filter((p) => String(p.status || "").toUpperCase() === "REJECTED").length,
    [payments],
  );

  const pendingProofsCount = useMemo(
    () => payments.filter((p) => String(p.status || "").toUpperCase() === "SUBMITTED").length,
    [payments],
  );

  const recentPayments = useMemo(
    () =>
      [...payments]
        .filter((p) => p.amount && Number(p.amount) > 0)
        .sort((a, b) =>
          String(b.submittedAt || b.paymentDate || b.createdAt || "").localeCompare(
            String(a.submittedAt || a.paymentDate || a.createdAt || ""),
          ),
        )
        .slice(0, 6),
    [payments],
  );

  const monthlyPaymentBars = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleString("en-US", { month: "short" }), value: 0 });
    }
    payments.forEach((p) => {
      if (String(p.status || "APPROVED").toUpperCase() !== "APPROVED") return;
      const monthKey = String(p.paymentDate || p.submittedAt || p.createdAt || "").slice(0, 7);
      const month = months.find((m) => m.key === monthKey);
      if (month) month.value += Number(p.amount || 0);
    });
    return months;
  }, [payments]);

  return { submitted, approved, rejected, pendingProofsCount, recentPayments, monthlyPaymentBars };
}
