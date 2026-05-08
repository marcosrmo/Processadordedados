import { createContext, useContext, useState, useCallback, type ReactNode, type Dispatch, type SetStateAction } from "react";
import type { ConsolidatedRecord } from "@shared/schema";

interface ConsolidatedDataContextType {
  records: ConsolidatedRecord[];
  setRecords: Dispatch<SetStateAction<ConsolidatedRecord[]>>;
  loading: boolean;
  fetchRecords: () => void;
}

const ConsolidatedDataContext = createContext<ConsolidatedDataContextType | null>(null);

export function ConsolidatedDataProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<ConsolidatedRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRecords = useCallback(() => {
    setLoading(true);
    fetch("/api/consolidated")
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar dados");
        return res.json();
      })
      .then((data) => {
        setRecords(data || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return (
    <ConsolidatedDataContext.Provider value={{ records, setRecords, loading, fetchRecords }}>
      {children}
    </ConsolidatedDataContext.Provider>
  );
}

export function useConsolidatedData() {
  const ctx = useContext(ConsolidatedDataContext);
  if (!ctx) throw new Error("useConsolidatedData must be used within ConsolidatedDataProvider");
  return ctx;
}
