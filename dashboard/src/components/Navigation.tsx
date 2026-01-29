"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobalSearch } from "./GlobalSearch";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/leads", label: "Leads", icon: "👥" },
  { href: "/prs", label: "PRs", icon: "📬" },
  { href: "/airdrops", label: "Airdrops", icon: "💰" },
  { href: "/treasury", label: "Treasury", icon: "🏦" },
  { href: "/analytics", label: "Analytics", icon: "📈" },
  { href: "/activity", label: "Activity", icon: "⚡" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-[#0a0a0f] border-b border-[#1a1a2e] sticky top-0 z-40">
      <div className="px-4 md:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo & Nav */}
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold text-white">
              🌱 Appleseed
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-[#1a1a2e] text-white"
                        : "text-[#6a6a8a] hover:text-white hover:bg-[#1a1a2e]/50"
                    }`}
                  >
                    <span className="mr-1.5">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Search */}
          <div className="hidden md:block">
            <GlobalSearch />
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden p-2 text-[#6a6a8a] hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Mobile Nav - simplified for now */}
        <div className="md:hidden py-2 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-[#1a1a2e] text-white"
                      : "text-[#6a6a8a] hover:text-white"
                  }`}
                >
                  {item.icon}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
