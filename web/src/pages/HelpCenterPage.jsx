import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Compass,
  Cpu,
  ExternalLink,
  FileCheck,
  Grid,
  HelpCircle,
  Search,
  Server,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';

import { manualData, manualGroups } from '../data/userManualData.js';
import styles from './HelpCenterPage.module.css';

const ICON_MAP = {
  Activity,
  Wallet,
  FileCheck,
  ShieldCheck,
  Cpu,
  Server,
  Grid,
};

/**
 * Lightweight Rich Text Parser for Interconnected Help Content
 * Converts markdown headings, bullets, code, bold, and [Title](#anchor-id) links.
 */
function MarkdownRenderer({ content, onNavigateModule }) {
  const lines = content.trim().split('\n');
  const elements = [];
  let currentList = [];
  let listKey = 0;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} className={styles.bulletList}>
          {currentList.map((item, idx) => (
            <li key={idx} className={styles.bulletItem}>
              {parseInlineText(item, onNavigateModule)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      return;
    }

    // Level 3 Heading
    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={`h3-${index}`} className={styles.articleSectionTitle}>
          {line.replace('### ', '')}
        </h3>
      );
      return;
    }

    // Level 2 Heading
    if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={`h2-${index}`} className={styles.articleSectionTitle} style={{ fontSize: '20px' }}>
          {line.replace('## ', '')}
        </h2>
      );
      return;
    }

    // Bullet or Numbered item
    if (line.startsWith('- ') || /^\d+\.\s/.test(line)) {
      const text = line.replace(/^(-|\d+\.)\s+/, '');
      currentList.push(text);
      return;
    }

    // Normal paragraph
    flushList();
    elements.push(
      <p key={`p-${index}`} className={styles.articleText}>
        {parseInlineText(line, onNavigateModule)}
      </p>
    );
  });

  flushList();
  return <div className={styles.articleBody}>{elements}</div>;
}

/**
 * Parses inline formatting: **bold**, `code`, and [Text](#target-id)
 */
function parseInlineText(text, onNavigateModule) {
  // Pattern for links [Text](#target) or standard text
  const linkRegex = /\[([^\]]+)\]\(#([^)]+)\)/g;
  const parts = [];
  let lastIdx = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(renderTextWithFormatting(text.slice(lastIdx, match.index)));
    }
    const label = match[1];
    const targetId = match[2];
    parts.push(
      <button
        key={`link-${match.index}`}
        type="button"
        className={styles.anchorLink}
        onClick={(e) => {
          e.preventDefault();
          onNavigateModule(targetId);
        }}
      >
        {label}
      </button>
    );
    lastIdx = linkRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(renderTextWithFormatting(text.slice(lastIdx)));
  }

  return parts;
}

function renderTextWithFormatting(text) {
  // Split on bold **text** and code `code`
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, i) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={i}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={i} className={styles.inlineCode}>{token.slice(1, -1)}</code>;
    }
    return token;
  });
}

export default function HelpCenterPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const contentRef = useRef(null);

  // Initialize active ID from URL hash or default to first module
  const initialId = location.hash ? location.hash.replace('#', '') : 'activity-transactions';
  const [activeId, setActiveId] = useState(initialId);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync hash changes with state
  useEffect(() => {
    if (location.hash) {
      const hashId = location.hash.replace('#', '');
      const exists = manualData.some((m) => m.id === hashId);
      if (exists) {
        setActiveId(hashId);
        if (contentRef.current) {
          contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  }, [location.hash]);

  const handleSelectModule = (id) => {
    setActiveId(id);
    navigate(`/help#${id}`, { replace: true });
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Filter modules based on search query
  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return manualData;
    return manualData.filter((item) => {
      return (
        item.title.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.keywords?.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [searchQuery]);

  // Group the filtered modules by group ID
  const groupedModules = useMemo(() => {
    const map = {};
    manualGroups.forEach((g) => {
      map[g.id] = [];
    });
    filteredModules.forEach((m) => {
      if (!map[m.groupId]) map[m.groupId] = [];
      map[m.groupId].push(m);
    });
    return map;
  }, [filteredModules]);

  // Active module object
  const activeModule = useMemo(() => {
    return manualData.find((m) => m.id === activeId) || manualData[0];
  }, [activeId]);

  // Related module objects
  const relatedModules = useMemo(() => {
    if (!activeModule.related) return [];
    return activeModule.related
      .map((relId) => manualData.find((m) => m.id === relId))
      .filter(Boolean);
  }, [activeModule]);

  return (
    <div className={styles.pageContainer}>
      {/* HEADER CARD */}
      <div className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <BookOpen size={28} className={styles.titleIcon} />
            <div>
              <h1 className={styles.pageTitle}>Help Center & Documentation</h1>
              <p className={styles.pageSubtitle}>
                Comprehensive, interconnected reference guide for the JOBENPAY Universal Engine.
              </p>
            </div>
          </div>
        </div>

        {/* SEARCH BOX */}
        <div className={styles.searchBox}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search all 39 modules (e.g., PQC, DIP, Payouts, Mandates, Circuit Breakers)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery ? (
            <button
              type="button"
              className={styles.clearSearchBtn}
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {/* TWO-COLUMN LAYOUT */}
      <div className={styles.layoutGrid}>
        {/* LEFT: MODULE DIRECTORY */}
        <aside className={styles.sidebarList}>
          {filteredModules.length === 0 ? (
            <div className={styles.emptySearchState}>
              <HelpCircle size={32} />
              <p>No modules match your query "{searchQuery}".</p>
            </div>
          ) : (
            manualGroups.map((group) => {
              const items = groupedModules[group.id] || [];
              if (items.length === 0) return null;
              const GroupIcon = ICON_MAP[group.icon] || Compass;

              return (
                <div key={group.id} className={styles.groupBlock}>
                  <div className={styles.groupLabel}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <GroupIcon size={12} />
                      {group.name}
                    </span>
                    <span>{items.length}</span>
                  </div>
                  {items.map((mod) => (
                    <button
                      key={mod.id}
                      type="button"
                      className={`${styles.moduleButton} ${
                        mod.id === activeModule.id ? styles.moduleButtonActive : ''
                      }`}
                      onClick={() => handleSelectModule(mod.id)}
                    >
                      <span>{mod.title}</span>
                      <ChevronRight size={14} opacity={mod.id === activeModule.id ? 1 : 0.4} />
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </aside>

        {/* RIGHT: READING CONTENT */}
        <main className={styles.contentCard} ref={contentRef}>
          {/* BREADCRUMBS */}
          <div className={styles.breadcrumbs}>
            <span>Help</span>
            <span className={styles.breadcrumbSeparator}>/</span>
            <span>{activeModule.group}</span>
            <span className={styles.breadcrumbSeparator}>/</span>
            <strong style={{ color: 'var(--jp-text)' }}>{activeModule.title}</strong>
          </div>

          {/* ARTICLE HEADER */}
          <div className={styles.articleHeader}>
            <div style={{ flex: 1 }}>
              <h2 className={styles.articleTitle}>{activeModule.title}</h2>
              <p className={styles.articleSummary}>{activeModule.summary}</p>
            </div>
            {activeModule.route ? (
              <Link to={activeModule.route} className={styles.liveActionBtn}>
                <span>Open Live Feature</span>
                <ExternalLink size={14} />
              </Link>
            ) : null}
          </div>

          {/* NAVIGATION PATH CALLOUT */}
          <div className={styles.navPathCallout}>
            <Compass size={16} className={styles.navPathIcon} />
            <div>
              <strong>Navigation Path: </strong>
              <span>{activeModule.path}</span>
            </div>
          </div>

          {/* ARTICLE BODY */}
          <MarkdownRenderer
            content={activeModule.content}
            onNavigateModule={handleSelectModule}
          />

          {/* RELATED MODULES SECTION */}
          {relatedModules.length > 0 ? (
            <div className={styles.relatedSection}>
              <h4 className={styles.relatedTitle}>Related Modules & Governance Chains</h4>
              <div className={styles.relatedGrid}>
                {relatedModules.map((rel) => (
                  <button
                    key={rel.id}
                    type="button"
                    className={styles.relatedCard}
                    onClick={() => handleSelectModule(rel.id)}
                  >
                    <div className={styles.relatedCardText}>
                      <span className={styles.relatedCardName}>{rel.title}</span>
                      <span className={styles.relatedCardGroup}>{rel.group}</span>
                    </div>
                    <ArrowRight size={14} color="var(--jp-blue)" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
