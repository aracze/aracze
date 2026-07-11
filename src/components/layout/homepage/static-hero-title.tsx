import Search from "@/components/features/search/search";

export const StaticHeroTitle = ({ title }: { title: string }) => {
  return (
    <div className="relative z-[101] h-full flex flex-col items-center justify-center px-4">
      <h1 className="text-4xl md:text-6xl font-bold text-white text-center drop-shadow-lg max-w-4xl">
        {title}
      </h1>

      {/* Main Search Component (Functional) */}
      <div className="mt-8 w-full max-w-2xl">
        <Search variant="homepage" />
      </div>
    </div>
  );
};
