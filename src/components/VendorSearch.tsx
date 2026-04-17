"use client";

/**
 * Quick-source buttons. Click any vendor to open a pre-filled search in a new tab.
 * Designer copies the actual product URL back into the custom item creator.
 *
 * Why not a live API? Target/Wayfair/Amazon all have locked APIs. This is the
 * honest, 2-click flow that actually works.
 */

interface Props {
  query: string;
  compact?: boolean;
}

const VENDORS = [
  {
    name: "Wayfair",
    icon: "W",
    color: "bg-purple-600",
    url: (q: string) => `https://www.wayfair.com/keyword.php?keyword=${encodeURIComponent(q)}`,
  },
  {
    name: "Target",
    icon: "T",
    color: "bg-red-600",
    url: (q: string) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
  },
  {
    name: "Amazon",
    icon: "A",
    color: "bg-amber-700",
    url: (q: string) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  },
  {
    name: "Home Depot",
    icon: "H",
    color: "bg-orange-600",
    url: (q: string) => `https://www.homedepot.com/s/${encodeURIComponent(q)}`,
  },
  {
    name: "IKEA",
    icon: "I",
    color: "bg-blue-700",
    url: (q: string) => `https://www.ikea.com/us/en/search/?q=${encodeURIComponent(q)}`,
  },
  {
    name: "West Elm",
    icon: "WE",
    color: "bg-stone-700",
    url: (q: string) => `https://www.westelm.com/search/results.html?words=${encodeURIComponent(q)}`,
  },
  {
    name: "Article",
    icon: "AR",
    color: "bg-zinc-800",
    url: (q: string) => `https://www.article.com/search?keyword=${encodeURIComponent(q)}`,
  },
  {
    name: "Etsy",
    icon: "E",
    color: "bg-orange-500",
    url: (q: string) => `https://www.etsy.com/search?q=${encodeURIComponent(q)}`,
  },
];

export default function VendorSearch({ query, compact }: Props) {
  if (!query.trim()) return null;

  if (compact) {
    return (
      <div className="inline-flex flex-wrap gap-1">
        {VENDORS.slice(0, 4).map(v => (
          <a
            key={v.name}
            href={v.url(query)}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center h-6 w-6 rounded ${v.color} text-white text-[10px] font-bold hover:opacity-80`}
            title={`Search "${query}" on ${v.name}`}
            onClick={e => e.stopPropagation()}
          >
            {v.icon}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-brand-900/5 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-2">
        🔎 Quick-source this item
      </div>
      <p className="text-[11px] text-brand-600 mb-3">
        Opens search for <strong>&quot;{query}&quot;</strong> on each vendor. Copy the product URL back into your custom item.
      </p>
      <div className="grid grid-cols-4 gap-2">
        {VENDORS.map(v => (
          <a
            key={v.name}
            href={v.url(query)}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white hover:opacity-90 transition ${v.color}`}
            onClick={e => e.stopPropagation()}
          >
            <span className="font-bold">{v.icon}</span>
            <span className="truncate">{v.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
