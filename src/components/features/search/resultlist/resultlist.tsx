import Link from "next/link";
import type { FuseResult } from "fuse.js";
import type { SearchItem } from "@/types/search";
import { MapPin } from "lucide-react";

export function ResultList({
  results,
  handleLinkClicked,
}: {
  results: FuseResult<SearchItem>[];
  handleLinkClicked: () => void;
}) {
  if (results.length === 0) return null;

  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-top-2 duration-300 pt-2">
      {results
        .slice(0, 10)
        .map((result: FuseResult<SearchItem>, index: number) => {
          // Simple attempt to highlight query in title if we want, but keeping it simple for now
          return (
            <Link
              // fullSlug mají jen stránky; ostatní položky (služby) padnou na
              // homepage místo neplatného odkazu.
              href={result.item.fullSlug || result.item.slug || "/"}
              key={result.item.documentId || `result-${index}`}
              onClick={() => handleLinkClicked()}
              className="group flex items-center py-2 px-1 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="w-10 flex justify-center shrink-0">
                <MapPin
                  className="w-5 h-5 text-[#1a3f6c]"
                  fill="#1a3f6c"
                  fillOpacity={0.1}
                  strokeWidth={2.5}
                />
              </div>
              <div className="ml-2 flex items-baseline gap-2">
                <span className="font-bold text-gray-900 group-hover:text-[#215491] transition-colors text-base">
                  {result.item.title}
                </span>
                {result.item.text && (
                  <span className="text-sm text-gray-400 line-clamp-1 hidden md:inline">
                    {result.item.text.replace(/[#*]/g, "").slice(0, 100)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
    </div>
  );
}
