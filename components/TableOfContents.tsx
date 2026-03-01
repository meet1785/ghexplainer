"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/**
 * Floating Table of Contents + Reading Progress
 *
 * Features:
 * - Auto-extracts headings from rendered markdown
 * - Scroll-spy: highlights current section using IntersectionObserver
 * - Smooth scroll-to on click
 * - Reading progress bar at top
 * - Collapsible sidebar
 * - Mobile-friendly drawer (toggle button)
 *
 * Demonstrates: IntersectionObserver API, scroll performance,
 * DOM querying, responsive design, smooth animations.
 */

interface TocEntry {
  id: string;
  text: string;
  level: number;
  element: Element;
}

interface TableOfContentsProps {
  /** The container element ref that holds the rendered markdown */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Whether analysis is complete (don't show while streaming) */
  isComplete: boolean;
}

export default function TableOfContents({ containerRef, isComplete }: TableOfContentsProps) {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [readingProgress, setReadingProgress] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const tocRef = useRef<HTMLDivElement>(null);

  // Track mobile breakpoint
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1280);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Extract headings from rendered markdown container
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isComplete) return;

    // Small delay to ensure markdown is rendered
    const timer = setTimeout(() => {
      const headings = container.querySelectorAll("h1, h2, h3");
      const tocEntries: TocEntry[] = [];

      headings.forEach((heading, i) => {
        // Generate stable ID
        const text = heading.textContent ?? "";
        const id = heading.id || `heading-${i}-${text.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`;
        if (!heading.id) heading.id = id;

        const level = parseInt(heading.tagName.charAt(1));
        tocEntries.push({ id, text, level, element: heading });
      });

      setEntries(tocEntries);
    }, 500);

    return () => clearTimeout(timer);
  }, [containerRef, isComplete]);

  // Set up IntersectionObserver for scroll-spy
  useEffect(() => {
    if (entries.length === 0) return;

    // Disconnect previous observer
    observerRef.current?.disconnect();

    const visibleSections = new Set<string>();

    const observer = new IntersectionObserver(
      (observerEntries) => {
        for (const entry of observerEntries) {
          if (entry.isIntersecting) {
            visibleSections.add(entry.target.id);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }

        // Active = first visible heading in document order
        for (const tocEntry of entries) {
          if (visibleSections.has(tocEntry.id)) {
            setActiveId(tocEntry.id);
            break;
          }
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      }
    );

    for (const entry of entries) {
      observer.observe(entry.element);
    }

    observerRef.current = observer;
    return () => observer.disconnect();
  }, [entries]);

  // Reading progress tracking
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.min(1, scrollTop / docHeight) : 0;
      setReadingProgress(progress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Scroll to heading
  const scrollTo = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100; // Account for sticky header
      const y = element.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: y, behavior: "smooth" });
      setActiveId(id);
      if (isMobile) setIsOpen(false);
    }
  }, [isMobile]);

  // Memoized active index for progress
  const activeIndex = useMemo(() => {
    return entries.findIndex(e => e.id === activeId);
  }, [entries, activeId]);

  if (entries.length === 0 || !isComplete) return null;

  const sectionProgress = entries.length > 1
    ? `${activeIndex + 1}/${entries.length}`
    : "";

  // ─── Render ────────────────────────────────────────────────

  return (
    <>
      {/* Reading Progress Bar — fixed at top */}
      <div className="fixed top-0 left-0 right-0 z-30 h-0.5 bg-edge/30">
        <div
          className="h-full bg-gradient-to-r from-gold via-coral to-jade transition-all duration-150 ease-out"
          style={{ width: `${readingProgress * 100}%` }}
        />
      </div>

      {/* Mobile toggle button */}
      {isMobile && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed top-16 right-4 z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface/90 border border-edge text-faint hover:text-cream backdrop-blur-sm transition-all duration-300 text-xs font-mono"
          title="Table of Contents"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          {sectionProgress && <span>{sectionProgress}</span>}
        </button>
      )}

      {/* TOC Sidebar */}
      <div
        ref={tocRef}
        className={`
          fixed z-30 transition-all duration-300 ease-in-out
          ${isMobile
            ? `top-0 right-0 h-full w-72 bg-midnight/95 border-l border-edge backdrop-blur-xl transform ${
                isOpen ? "translate-x-0" : "translate-x-full"
              }`
            : "top-24 right-4 w-56"
          }
        `}
      >
        {/* Mobile header */}
        {isMobile && isOpen && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <p className="text-xs font-semibold text-cream font-mono">Contents</p>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:bg-surface text-faint hover:text-cream transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className={`${isMobile ? "px-4 py-3" : ""} max-h-[calc(100vh-120px)] overflow-y-auto`}>
          {/* Desktop header */}
          {!isMobile && (
            <div className="flex items-center justify-between mb-2 px-2">
              <p className="text-[10px] font-mono uppercase tracking-wider text-faint">Contents</p>
              {sectionProgress && (
                <span className="text-[10px] font-mono text-gold/60">{sectionProgress}</span>
              )}
            </div>
          )}

          {/* Mini progress dots */}
          {!isMobile && (
            <div className="flex gap-0.5 mb-3 px-2">
              {entries.filter(e => e.level === 1).map((entry, i) => {
                const isActive = entries.indexOf(entry) <= activeIndex;
                const isCurrent = entry.id === activeId;
                return (
                  <button
                    key={entry.id}
                    onClick={() => scrollTo(entry.id)}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      isCurrent
                        ? "w-4 bg-gold"
                        : isActive
                        ? "w-2 bg-gold/40"
                        : "w-2 bg-edge"
                    }`}
                    title={entry.text}
                  />
                );
              })}
            </div>
          )}

          {/* Entry list */}
          <nav aria-label="Table of contents">
            <ul className="space-y-0.5">
              {entries.map((entry) => {
                const isActive = entry.id === activeId;
                const indent = entry.level === 1 ? 0 : entry.level === 2 ? 12 : 24;

                return (
                  <li key={entry.id}>
                    <button
                      onClick={() => scrollTo(entry.id)}
                      className={`
                        w-full text-left px-2 py-1.5 rounded-lg text-[11px] leading-tight
                        transition-all duration-200 group
                        ${isActive
                          ? "bg-gold/10 text-gold font-medium"
                          : "text-faint hover:text-cream hover:bg-surface/60"
                        }
                      `}
                      style={{ paddingLeft: `${8 + indent}px` }}
                      title={entry.text}
                    >
                      <div className="flex items-center gap-1.5">
                        {/* Active indicator */}
                        <span
                          className={`shrink-0 w-1 h-1 rounded-full transition-all duration-300 ${
                            isActive ? "bg-gold scale-125" : "bg-transparent group-hover:bg-faint"
                          }`}
                        />
                        <span className={`truncate font-mono ${entry.level === 1 ? "font-semibold" : ""}`}>
                          {entry.text.replace(/^\d+\.\s*/, "")}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>

      {/* Mobile backdrop */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-20 bg-midnight/40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
