import { useState, useCallback, useEffect } from "react";
import { Alert, Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Expense, ExpenseCategory } from "../types";
import { API_URL, parseJsonResponse } from "../services/api";

export interface FinancialSummary {
  month: string;
  collection: {
    totalPaid: number;
    count: number;
  };
  dues: {
    totalPending: number;
    count: number;
  };
  expenses: {
    totalExpenses: number;
    byCategory: Record<string, number>;
    count: number;
  };
  netCashFlow: number;
}

export interface ExpenseActionsProps {
  selectedHostelId?: string;
  token: string | null;
}

export function useExpenseActions({ selectedHostelId, token }: ExpenseActionsProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const fetchExpensesAndSummary = useCallback(
    async (month?: string) => {
      if (!selectedHostelId || !token) return;
      setLoading(true);
      try {
        const query = month ? `?month=${month}` : "";
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        };

        const [expensesRes, summaryRes] = await Promise.all([
          fetch(`${API_URL}/hostels/${selectedHostelId}/expenses${query}`, { headers }).then(
            parseJsonResponse,
          ),
          fetch(`${API_URL}/hostels/${selectedHostelId}/financial-summary${query}`, { headers }).then(
            parseJsonResponse,
          ),
        ]);

        const rawExpenses = (expensesRes as any)?.expenses;
        if (Array.isArray(rawExpenses)) {
          setExpenses(rawExpenses);
        }

        const rawSummary = summaryRes as FinancialSummary;
        if (rawSummary && rawSummary.collection) {
          setFinancialSummary(rawSummary);
        }
      } catch (err) {
        console.warn("Error loading expenses/financials:", err);
      } finally {
        setLoading(false);
      }
    },
    [selectedHostelId, token],
  );

  useEffect(() => {
    if (selectedHostelId && token) {
      void fetchExpensesAndSummary(selectedMonth || undefined);
    }
  }, [selectedHostelId, token, selectedMonth, fetchExpensesAndSummary]);

  const addExpense = useCallback(
    async (data: {
      title: string;
      category: ExpenseCategory;
      amount: number;
      date: string;
      notes?: string;
      receiptUrl?: string;
    }): Promise<boolean> => {
      if (!selectedHostelId || !token) {
        Alert.alert("Error", "Please select a hostel first.");
        return false;
      }

      try {
        const response = await fetch(`${API_URL}/hostels/${selectedHostelId}/expenses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(data),
        });

        const resData = (await parseJsonResponse(response)) as any;
        if (!response.ok) {
          throw new Error(resData?.message || "Failed to record expense");
        }

        await fetchExpensesAndSummary(selectedMonth || undefined);
        Alert.alert("Success", "Expense recorded successfully.");
        return true;
      } catch (err) {
        Alert.alert(
          "Error adding expense",
          err instanceof Error ? err.message : "Please check your network and try again.",
        );
        return false;
      }
    },
    [selectedHostelId, token, selectedMonth, fetchExpensesAndSummary],
  );

  const deleteExpense = useCallback(
    async (expenseId: string): Promise<boolean> => {
      if (!selectedHostelId || !token) return false;

      return new Promise((resolve) => {
        Alert.alert(
          "Delete Expense",
          "Are you sure you want to delete this expense record?",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                try {
                  const response = await fetch(
                    `${API_URL}/hostels/${selectedHostelId}/expenses/${expenseId}`,
                    {
                      method: "DELETE",
                      headers: { Authorization: `Bearer ${token}` },
                    },
                  );

                  if (!response.ok) {
                    throw new Error("Failed to delete expense");
                  }

                  await fetchExpensesAndSummary(selectedMonth || undefined);
                  Alert.alert("Deleted", "Expense record deleted.");
                  resolve(true);
                } catch (err) {
                  Alert.alert("Error", "Unable to delete expense.");
                  resolve(false);
                }
              },
            },
          ],
        );
      });
    },
    [selectedHostelId, token, selectedMonth, fetchExpensesAndSummary],
  );

  const exportFinancialCsv = useCallback(
    async (month?: string): Promise<void> => {
      if (!selectedHostelId || !token) {
        Alert.alert("Error", "Please select a hostel first.");
        return;
      }

      try {
        const query = month ? `?month=${month}` : "";
        const response = await fetch(
          `${API_URL}/hostels/${selectedHostelId}/financial-export${query}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to export financial report.");
        }

        const csvContent = await response.text();
        const filename = `Hostella_Financials_${month || "All"}_${Date.now()}.csv`;

        if (Platform.OS === "web") {
          // Web download trigger
          const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.setAttribute("href", url);
          link.setAttribute("download", filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return;
        }

        // Native mobile download and sharing via Expo Sharing
        const file = new FileSystem.File(FileSystem.Paths.cache, filename);
        if (file.exists) {
          file.delete();
        }
        file.create();
        file.write(csvContent);

        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(file.uri, {
            mimeType: "text/csv",
            dialogTitle: "Export Financial Ledger (CSV)",
            UTI: "public.comma-separated-values-text",
          });
        } else {
          Alert.alert("Report Generated", `Saved to: ${file.uri}`);
        }
      } catch (err) {
        Alert.alert(
          "Export Failed",
          err instanceof Error ? err.message : "Unable to generate CSV export.",
        );
      }
    },
    [selectedHostelId, token],
  );

  return {
    expenses,
    financialSummary,
    loading,
    selectedMonth,
    setSelectedMonth,
    fetchExpensesAndSummary,
    addExpense,
    deleteExpense,
    exportFinancialCsv,
  };
}
