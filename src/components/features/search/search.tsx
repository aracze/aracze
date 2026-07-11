"use client";

import { HeaderSearch } from "./header-search";
import { HomepageSearch } from "./homepage-search";

interface SearchProps {
  variant?: "header" | "homepage";
}

export default function Search({ variant = "header" }: SearchProps) {
  if (variant === "homepage") {
    return <HomepageSearch />;
  }

  return <HeaderSearch />;
}
