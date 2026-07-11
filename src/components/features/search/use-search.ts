import { useState, useEffect } from "react";
import type { FuseResult } from "fuse.js";
import type { SearchItem } from "@/types/search";

export function useSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FuseResult<SearchItem>[]>([]);

  useEffect(() => {
    const fetchResults = async () => {
      if (query.length > 0) {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          if (data.success) {
            setResults(data.message);
          }
        } catch (error) {
          console.error("Search fetch error:", error);
        }
      } else {
        setResults([]);
      }
    };

    const timer = setTimeout(fetchResults, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const clearSearch = () => {
    setQuery("");
    setResults([]);
  };

  return { query, setQuery, results, setResults, clearSearch };
}
