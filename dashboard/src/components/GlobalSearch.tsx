"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface SearchResult {
  id: number;
  username: string;
  githubId: number;
  tier: string | null;
  score: number;
  outreachStatus: string;
  airdropStatus: string;
}

const API_URL = "https://appleseed-api.c3dar.workers.dev";

const tierColors: Record<string, string> = {
  A: "#00ff88",
  B: "#00f0ff",
  C: "#ffcc00",
  D: "#6a6a8a",
};

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(q)}&limit=8`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) {
        search(query);
      } else {
        setResults([]);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, search]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search prospects... (⌘K)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-64 px-4 py-2 pl-10 bg-[#0d0d14] border border-[#1a1a2e] rounded-lg text-sm text-white placeholder-[#6a6a8a] focus:outline-none focus:border-[#00f0ff] transition-colors"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6a6a8a]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && (query.length >= 2 || results.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#0d0d14] border border-[#1a1a2e] rounded-lg shadow-xl overflow-hidden z-50">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[#6a6a8a]">
              {loading ? "Searching..." : "No results found"}
            </div>
          ) : (
            <div>
              {results.map((result) => (
                <Link
                  key={result.id}
                  href={`/leads?search=${encodeURIComponent(result.username)}`}
                  onClick={() => {
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a2e] transition-colors"
                >
                  <img
                    src={`https://avatars.githubusercontent.com/u/${result.githubId}?s=32`}
                    alt={result.username}
                    className="w-8 h-8 rounded-full bg-[#1a1a2e]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {result.username}
                    </div>
                    <div className="text-xs text-[#6a6a8a]">
                      Score: {result.score}
                    </div>
                  </div>
                  {result.tier && (
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: tierColors[result.tier] + "20",
                        color: tierColors[result.tier],
                      }}
                    >
                      {result.tier}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
